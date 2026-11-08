import { mergeLineRects, unionBoxes, type Box } from "./geometry";
import { isSkippedCopy } from "./skip";

export type Paper = "cream" | "receipt" | "kraft";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type ReducedMotion = "fade" | "none";

export type TearInfo = {
  /** Visual lines in the selection. No text is included. */
  lines: number;
};

export type TearcopyOptions = {
  /** Element or document that hears the copy event. Defaults to document. */
  root?: HTMLElement | Document;
  /** Paper colour of the scrap. Defaults to cream. */
  paper?: Paper;
  /** Where the scraps flutter. Defaults to bottom-right. */
  corner?: Corner;
  /** Flight length in milliseconds. Defaults to 980. */
  duration?: number;
  /** Lines kept as their own scraps. The rest travel as one tail. Defaults to 8. */
  maxLines?: number;
  /** What to do when the OS asks for reduced motion. Defaults to fade. */
  reducedMotion?: ReducedMotion;
  /** Fires after a tear starts. Receives a line count, never the copied text. */
  onTear?: (info: TearInfo) => void;
};

type Motion = "fly" | "fade";

type Line = {
  box: Box;
  block: HTMLElement;
};

const PAPERS: Record<Paper, { light: string; dark: string }> = {
  cream: { light: "#fffaf1", dark: "#2c2824" },
  receipt: { light: "#f7f7f2", dark: "#1e1e1e" },
  kraft: { light: "#e0bc84", dark: "#3d2a18" },
};

const TEXT_PROPS = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontStretch",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "color",
  "textTransform",
  "textAlign",
  "textIndent",
  "whiteSpace",
  "fontVariant",
  "fontKerning",
  "fontFeatureSettings",
  "textDecorationLine",
  "textDecorationStyle",
  "textDecorationColor",
  "textDecorationThickness",
  "direction",
  "tabSize",
  "wordBreak",
  "overflowWrap",
  "hyphens",
  "verticalAlign",
  "display",
] as const;

const BOX_PROPS = [
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

const MAX_ACTIVE = 3;
const STAGGER = 46;
const AREA_LIMIT = 0.4;

/**
 * Listen for real copy events and play a paper-tear over the selection.
 * The listener never calls preventDefault and never touches the clipboard.
 * The returned function removes the listener, cancels scraps, and is safe to call twice.
 */
export function tearcopy(options: TearcopyOptions = {}): () => void {
  if (typeof document === "undefined") return () => {};

  const root = options.root ?? document;
  const paper = normalizePaper(options.paper);
  const corner = normalizeCorner(options.corner);
  const duration = clamp(options.duration ?? 980, 280, 4000);
  const maxLines = Math.round(clamp(options.maxLines ?? 8, 1, 24));
  const reducedMotion = options.reducedMotion === "none" ? "none" : "fade";

  let disposed = false;
  const active: Tear[] = [];
  let layer: HTMLDivElement | null = null;
  let style: HTMLStyleElement | null = null;

  const onCopy = (event: Event) => {
    if (disposed) return;
    try {
      play(event);
    } catch {
      // The animation is optional. A throw must not affect the copy.
    }
  };

  root.addEventListener("copy", onCopy, true);

  return () => {
    if (disposed) return;
    disposed = true;
    root.removeEventListener("copy", onCopy, true);
    for (const tear of [...active]) tear.close();
    layer?.remove();
    layer = null;
    style?.remove();
    style = null;
    document.documentElement.removeAttribute("data-tearcopy-hide-selection");
  };

  function play(event: Event) {
    const selection = document.getSelection();
    if (isSkippedCopy(event.target, selection) || !selection) return;
    if (root instanceof HTMLElement && (!selection.anchorNode || !root.contains(selection.anchorNode))) return;

    const ranges: Range[] = [];
    for (let i = 0; i < selection.rangeCount; i++) ranges.push(selection.getRangeAt(i));
    if (ranges.length === 0) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce && reducedMotion === "none") {
      const count = countLines(ranges);
      if (count > 0) options.onTear?.({ lines: count });
      return;
    }

    const built = collectLines(ranges);
    if (!built) return;
    const motion: Motion = reduce || built.degrade ? "fade" : "fly";
    const lines = motion === "fade" && built.degrade ? [] : shapeLines(built.lines, maxLines, motion);
    if (motion !== "fade" && lines.length === 0) return;
    if (built.degrade && !built.bounds) return;

    const tear = createTear({
      lines,
      bounds: built.bounds,
      degrade: built.degrade,
      motion,
      paper,
      corner,
      duration,
      ink: built.ink,
      patch: built.patch,
    });
    while (active.length >= MAX_ACTIVE) active.shift()?.close();
    active.push(tear);
    options.onTear?.({ lines: built.count });
  }

  function createTear(spec: TearSpec): Tear {
    const host = ensureLayer();
    const group = document.createElement("div");
    group.dataset.tearcopyTear = "";
    group.style.cssText = "position:absolute;inset:0;pointer-events:none;";
    host.append(group);

    const anims: Animation[] = [];
    const motion = spec.motion;
    const scraps = spec.degrade || spec.lines.length === 0
      ? spec.bounds
        ? [spec.bounds]
        : []
      : spec.lines.map((line) => line.box);

    scraps.forEach((box, index) => {
      const line = spec.lines[index];
      const delay = motion === "fly" ? index * STAGGER : 0;
      const patch = makePatch(box, spec.patch);
      group.append(patch);
      pushAnim(anims, animatePatch(patch, motion, spec.duration, delay));

      const strip = document.createElement("div");
      strip.dataset.tearcopyStrip = "";
      strip.dataset.tearcopyMotion = motion;
      strip.setAttribute("aria-hidden", "true");
      strip.style.cssText = [
        "position:absolute",
        `left:${px(box.left)}`,
        `top:${px(box.top)}`,
        `width:${px(box.width)}`,
        `height:${px(box.height)}`,
        "overflow:visible",
        "pointer-events:none",
        motion === "fly" ? "perspective:700px" : "perspective:none",
        "perspective-origin:center bottom",
      ].join(";");

      const curl = document.createElement("div");
      curl.style.cssText = "position:absolute;inset:0;";
      const paperEl = makePaper(box, spec.paper, spec.ink, index);
      curl.append(paperEl);

      if (line && !spec.degrade) {
        const ink = document.createElement("div");
        ink.dataset.tearcopyInk = "";
        ink.style.cssText = "position:absolute;inset:0;overflow:hidden;";
        const clone = cloneBlock(line.block);
        if (clone) {
          positionClone(clone, line.block, box);
          ink.append(clone);
          curl.append(ink);
        }
      }

      strip.append(curl);
      group.append(strip);
      const block = line?.block;
      if (block) {
        const clone = strip.querySelector("[data-tearcopy-ink] > *");
        if (clone instanceof HTMLElement) {
          clone.scrollTop = block.scrollTop;
          clone.scrollLeft = block.scrollLeft;
        }
      }
      if (motion === "fly") {
        pushAnim(anims, animateFlight(strip, box, spec.corner, spec.duration, delay, index));
        pushAnim(anims, animateCurl(curl, spec.duration, delay, index));
        pushAnim(anims, animateShadow(paperEl, spec.duration, delay));
      } else {
        pushAnim(anims, animateFade(strip, spec.duration));
      }
    });

    let closed = false;
    const tear: Tear = { close: () => finish() };
    const timeout = window.setTimeout(
      () => tear.close(),
      anims.length === 0 ? 30 : lifetime(spec.duration, scraps.length, motion),
    );
    let pending = anims.length;

    function finish() {
      if (closed) return;
      closed = true;
      window.clearTimeout(timeout);
      group.remove();
      for (const anim of anims) anim.cancel();
      const index = active.indexOf(tear);
      if (index >= 0) active.splice(index, 1);
      if (active.length === 0) {
        layer?.remove();
        layer = null;
        style?.remove();
        style = null;
        document.documentElement.removeAttribute("data-tearcopy-hide-selection");
      }
    }

    for (const anim of anims) {
      anim.onfinish = () => {
        pending -= 1;
        if (pending <= 0) tear.close();
      };
    }
    return tear;
  }

  function ensureLayer(): HTMLDivElement {
    if (layer?.isConnected) return layer;
    ensureStyle();
    layer = document.createElement("div");
    layer.dataset.tearcopyLayer = "";
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    layer.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483000",
      "pointer-events:none",
      "contain:layout paint",
      "overflow:hidden",
      "margin:0",
      "padding:0",
    ].join(";");
    document.body.append(layer);
    document.documentElement.setAttribute("data-tearcopy-hide-selection", "");
    return layer;
  }

  function ensureStyle() {
    if (style?.isConnected) return;
    style = document.createElement("style");
    style.dataset.tearcopyStyle = "";
    style.textContent =
      "html[data-tearcopy-hide-selection]::selection,html[data-tearcopy-hide-selection] *::selection{background:transparent !important;color:inherit !important;}";
    document.head.append(style);
  }
}

type Tear = { close: () => void };

type Built = {
  lines: Line[];
  bounds: Box | null;
  degrade: boolean;
  count: number;
  ink: string;
  patch: string;
};

type TearSpec = {
  lines: Line[];
  bounds: Box | null;
  degrade: boolean;
  motion: Motion;
  paper: Paper;
  corner: Corner;
  duration: number;
  ink: string;
  patch: string;
};

function collectLines(ranges: Range[]): Built | null {
  const lines: Line[] = [];
  let degrade = false;
  const all: Box[] = [];
  let ink = "#24180f";
  let patch = "#ffffff";
  let sampled = false;

  for (const range of ranges) {
    const boxes = mergeLineRects([...range.getClientRects()]);
    all.push(...boxes);
    const anchor = hostElement(range);
    if (!sampled && anchor) {
      ink = getComputedStyle(anchor).color || ink;
      patch = opaqueBackground(anchor);
      sampled = true;
    }
    if (!anchor || boxes.length === 0) continue;
    if (badContext(anchor)) {
      degrade = true;
      continue;
    }
    const shared = nearestBlock(anchor);
    const useShared = simpleBlock(shared);
    if (badContext(shared) || (shared.textContent?.length ?? 0) > 5000) {
      degrade = true;
      continue;
    }
    for (const box of boxes) {
      if (!inView(box)) continue;
      let block = useShared ? shared : null;
      if (!block) {
        const hit = nodeAt(box.left + Math.min(8, box.width / 2), box.top + box.height / 2);
        const element = hit instanceof Element ? hit : hit?.parentElement ?? null;
        if (!(element instanceof HTMLElement)) continue;
        block = nearestBlock(element);
        if (badContext(block) || (block.textContent?.length ?? 0) > 5000) {
          degrade = true;
          break;
        }
      }
      lines.push({ box, block });
    }
  }

  const bounds = unionBoxes(all);
  const count = all.length === 0 ? 0 : mergeLineRects(all).length;
  if (count === 0) return null;
  const view = window.innerWidth * window.innerHeight;
  const area = all.reduce((sum, box) => sum + box.width * box.height, 0);
  if (area > view * AREA_LIMIT) degrade = true;
  return { lines, bounds: bounds ? clampBox(bounds) : null, degrade, count, ink, patch };
}

function shapeLines(lines: Line[], maxLines: number, motion: Motion): Line[] {
  if (motion === "fade") return lines;
  if (lines.length <= maxLines) return lines;
  // ponytail: the tail is one tall window over the leftover lines, not a reflow.
  const head = lines.slice(0, maxLines - 1);
  const tail = lines.slice(maxLines - 1);
  const box = unionBoxes(tail.map((line) => line.box));
  if (!box) return head;
  return [...head, { box, block: tail[0].block }];
}

function countLines(ranges: Range[]): number {
  const boxes: Box[] = [];
  for (const range of ranges) boxes.push(...range.getClientRects());
  return mergeLineRects(boxes).length;
}

function hostElement(range: Range): HTMLElement | null {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  return element instanceof HTMLElement ? element : null;
}

function nearestBlock(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  while (current && current !== document.body) {
    const display = getComputedStyle(current).display;
    if (isBlockDisplay(display)) return current;
    current = current.parentElement;
  }
  return element;
}

function simpleBlock(element: HTMLElement): boolean {
  return !element.querySelector(
    "p, pre, blockquote, li, h1, h2, h3, h4, h5, h6, section, article, ul, ol, table, div",
  );
}

function isBlockDisplay(display: string): boolean {
  return (
    display === "block" ||
    display === "list-item" ||
    display === "flex" ||
    display === "grid" ||
    display === "flow-root" ||
    display.startsWith("table")
  );
}

function badContext(element: Element | null): boolean {
  let current: Element | null = element;
  while (current && current !== document.documentElement.parentElement) {
    const style = getComputedStyle(current);
    if (style.writingMode && style.writingMode !== "horizontal-tb") return true;
    if (style.direction === "rtl") return true;
    const columns = style.columnCount;
    if (columns !== "auto" && columns !== "1") return true;
    if (!isIdentityTransform(style.transform)) return true;
    current = current.parentElement;
  }
  return false;
}

function isIdentityTransform(transform: string): boolean {
  if (!transform || transform === "none") return true;
  const match = transform.match(/^matrix(3d)?\(([^)]+)\)$/);
  if (!match) return false;
  const values = match[2].split(",").map((part) => Number.parseFloat(part));
  const identity = match[1]
    ? [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    : [1, 0, 0, 1, 0, 0];
  return values.length === identity.length && values.every((value, index) => Math.abs(value - identity[index]) < 0.01);
}

function inView(box: Box): boolean {
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  return x >= 0 && y >= 0 && x <= window.innerWidth && y <= window.innerHeight;
}

function clampBox(box: Box): Box | null {
  const left = Math.max(0, box.left);
  const top = Math.max(0, box.top);
  const right = Math.min(window.innerWidth, box.right);
  const bottom = Math.min(window.innerHeight, box.bottom);
  if (right - left < 2 || bottom - top < 2) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function nodeAt(x: number, y: number): Node | null {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  const range = doc.caretRangeFromPoint?.(x, y);
  if (range?.startContainer) return range.startContainer;
  const position = doc.caretPositionFromPoint?.(x, y);
  if (position?.offsetNode) return position.offsetNode;
  return document.elementFromPoint(x, y);
}

function opaqueBackground(start: Element | null): string {
  let current: Element | null = start;
  while (current) {
    const color = getComputedStyle(current).backgroundColor;
    const match = color.match(/rgba?\(([^)]+)\)/);
    if (match) {
      const parts = match[1].split(",").map((part) => Number.parseFloat(part));
      const alpha = parts.length >= 4 ? parts[3] : 1;
      if (alpha > 0.92) return color;
    }
    current = current.parentElement;
  }
  return "#ffffff";
}

function paperColor(preset: Paper, ink: string): string {
  const match = ink.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  const lightInk = match
    ? 0.2126 * Number(match[1]) + 0.7152 * Number(match[2]) + 0.0722 * Number(match[3]) > 186
    : false;
  const tone = PAPERS[preset];
  return lightInk ? tone.dark : tone.light;
}

function cloneBlock(block: HTMLElement): HTMLElement | null {
  const clone = block.cloneNode(true);
  if (!(clone instanceof HTMLElement)) return null;
  const sources = [block, ...block.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  const count = Math.min(sources.length, copies.length);
  for (let i = 0; i < count; i++) {
    const source = sources[i];
    const copy = copies[i];
    if (!(source instanceof HTMLElement) || !(copy instanceof HTMLElement)) continue;
    paintElement(source, copy, i === 0);
    sanitize(copy);
  }
  clone.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((node) => node.remove());
  return clone;
}

function paintElement(source: HTMLElement, copy: HTMLElement, root: boolean) {
  const style = getComputedStyle(source);
  copyProps(style, copy, TEXT_PROPS);
  if (!root) copyProps(style, copy, BOX_PROPS);
  copy.style.background = "transparent";
  copy.style.backgroundColor = "transparent";
  copy.style.boxShadow = "none";
  copy.style.filter = "none";
  copy.style.transform = "none";
  copy.style.animation = "none";
  copy.style.transition = "none";
  copy.style.borderStyle = "solid";
  copy.style.borderColor = "transparent";
  if (root) {
    const rect = source.getBoundingClientRect();
    copy.style.boxSizing = "border-box";
    copy.style.width = px(rect.width);
    copy.style.height = "auto";
    copy.style.maxWidth = "none";
    copy.style.margin = "0";
    copy.style.padding = `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`;
    copy.style.borderWidth = `${style.borderTopWidth} ${style.borderRightWidth} ${style.borderBottomWidth} ${style.borderLeftWidth}`;
    copy.style.overflow = style.overflow;
    copy.style.position = "absolute";
  }
}

function copyProps(style: CSSStyleDeclaration, target: HTMLElement, props: readonly string[]) {
  const from = style as unknown as Record<string, string>;
  const to = target.style as unknown as Record<string, string>;
  for (const prop of props) to[prop] = from[prop];
}

function sanitize(element: HTMLElement) {
  element.removeAttribute("id");
  element.removeAttribute("name");
  element.removeAttribute("contenteditable");
  if (element.tagName === "A") {
    element.removeAttribute("href");
    element.removeAttribute("target");
  }
  for (const attr of [...element.attributes]) {
    if (attr.name.startsWith("on")) element.removeAttribute(attr.name);
  }
}

function positionClone(clone: HTMLElement, block: HTMLElement, line: Box) {
  const rect = block.getBoundingClientRect();
  clone.style.left = px(rect.left - line.left);
  clone.style.top = px(rect.top - line.top);
}

function makePatch(box: Box, color: string): HTMLDivElement {
  const patch = document.createElement("div");
  patch.dataset.tearcopyPatch = "";
  patch.setAttribute("aria-hidden", "true");
  patch.style.cssText = [
    "position:absolute",
    `left:${px(box.left - 0.5)}`,
    `top:${px(box.top - 0.5)}`,
    `width:${px(box.width + 1)}`,
    `height:${px(box.height + 1)}`,
    `background:${color}`,
    "opacity:1",
    "pointer-events:none",
  ].join(";");
  return patch;
}

function pushAnim(anims: Animation[], anim: Animation | null) {
  if (anim) anims.push(anim);
}

function makePaper(box: Box, preset: Paper, ink: string, index: number): HTMLDivElement {
  const padX = 8;
  const padY = 4;
  const width = box.width + padX * 2;
  const height = box.height + padY * 2;
  const paper = document.createElement("div");
  paper.dataset.tearcopyPaper = "";
  paper.dataset.paper = preset;
  paper.style.cssText = [
    "position:absolute",
    `left:${px(-padX)}`,
    `top:${px(-padY)}`,
    `width:${px(width)}`,
    `height:${px(height)}`,
    `background-color:${paperColor(preset, ink)}`,
    "background-image:linear-gradient(180deg, rgba(255,255,255,0.38), rgba(255,255,255,0) 42%, rgba(70,40,10,0.06))",
    `clip-path:${raggedClip(width, height, index + 1)}`,
    "filter:drop-shadow(0 1px 1px rgba(48,30,12,0.2))",
    "pointer-events:none",
  ].join(";");
  return paper;
}

function raggedClip(width: number, height: number, seed: number): string {
  let state = (seed * 997) >>> 0 || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const jag = Math.min(3.4, Math.max(1.6, height * 0.14));
  const steps = Math.max(3, Math.min(14, Math.round(width / 26)));
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = (width * i) / steps;
    top.push(`${x.toFixed(1)}px ${(next() * jag).toFixed(1)}px`);
    bottom.push(`${x.toFixed(1)}px ${(height - next() * jag).toFixed(1)}px`);
  }
  bottom.reverse();
  return `polygon(${top.concat(bottom).join(",")})`;
}

function animateFlight(strip: HTMLElement, box: Box, corner: Corner, duration: number, delay: number, index: number): Animation | null {
  const target = cornerPoint(corner);
  const dx = target.x - (box.left + box.width / 2);
  const dy = target.y - (box.top + box.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  const side = index % 2 === 0 ? 1 : -1;
  const arc = 22 + (index % 3) * 12;
  const arcX = dx * 0.46 + (-dy / length) * arc * side;
  const arcY = dy * 0.46 + (dx / length) * arc * side;
  const tilt = side * 2.1;
  return safeAnimate(strip,
    [
      { transform: "translate3d(0,0,0) rotate(0deg) scale(1)", opacity: 1, offset: 0, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
      { transform: `translate3d(0,-8px,0) rotate(${tilt}deg) scale(1.015)`, opacity: 1, offset: 0.22, easing: "cubic-bezier(0.4, 0.05, 0.2, 1)" },
      { transform: `translate3d(${arcX}px,${arcY}px,0) rotate(${tilt * 3}deg) scale(0.86)`, opacity: 1, offset: 0.58 },
      { transform: `translate3d(${dx}px,${dy}px,0) rotate(${tilt * 8}deg) scale(0.36)`, opacity: 0, offset: 1 },
    ],
    { duration, delay, easing: "linear", fill: "both" },
  );
}

function animateCurl(curl: HTMLElement, duration: number, delay: number, index: number): Animation | null {
  const direction = index % 2 === 0 ? 1 : -1;
  return safeAnimate(curl,
    [
      { transform: "rotateX(0deg) rotateZ(0deg)", offset: 0 },
      { transform: `rotateX(${16 * direction}deg) rotateZ(${direction}deg)`, offset: 0.2 },
      { transform: `rotateX(${8 * direction}deg) rotateZ(${direction * 2}deg)`, offset: 0.55 },
      { transform: `rotateX(${20 * direction}deg) rotateZ(${direction * 4}deg)`, offset: 1 },
    ],
    { duration, delay, easing: "ease-in-out", fill: "both" },
  );
}

function animateShadow(paper: HTMLElement, duration: number, delay: number): Animation | null {
  return safeAnimate(paper,
    [
      { filter: "drop-shadow(0 1px 1px rgba(48,30,12,0.18))", offset: 0 },
      { filter: "drop-shadow(0 14px 10px rgba(48,30,12,0.24))", offset: 0.22 },
      { filter: "drop-shadow(0 20px 16px rgba(48,30,12,0.14))", offset: 1 },
    ],
    { duration, delay, easing: "ease-out", fill: "both" },
  );
}

function animateFade(strip: HTMLElement, duration: number): Animation | null {
  return safeAnimate(strip,
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.15 },
      { opacity: 0, offset: 1 },
    ],
    { duration: Math.min(duration, 420), easing: "ease-out", fill: "both" },
  );
}

function animatePatch(patch: HTMLElement, motion: Motion, duration: number, delay: number): Animation | null {
  if (motion === "fade") {
    return safeAnimate(patch,
      [
        { opacity: 1, offset: 0 },
        { opacity: 0, offset: 1 },
      ],
      { duration: Math.min(duration, 420), easing: "ease-out", fill: "both" },
    );
  }
  return safeAnimate(patch,
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.3 },
      { opacity: 0, offset: 0.72 },
    ],
    { duration, delay, easing: "linear", fill: "both" },
  );
}

function safeAnimate(
  element: HTMLElement,
  keyframes: Keyframe[] | PropertyIndexedKeyframes,
  options: KeyframeAnimationOptions,
): Animation | null {
  if (typeof element.animate !== "function") return null;
  try {
    return element.animate(keyframes, options);
  } catch {
    return null;
  }
}

function cornerPoint(corner: Corner): { x: number; y: number } {
  const margin = 36;
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (corner === "top-left") return { x: margin, y: margin };
  if (corner === "top-right") return { x: width - margin, y: margin };
  if (corner === "bottom-left") return { x: margin, y: height - margin };
  return { x: width - margin, y: height - margin };
}

function lifetime(duration: number, count: number, motion: Motion): number {
  if (motion === "fade") return Math.min(duration, 420) + 120;
  return duration + Math.max(0, count - 1) * STAGGER + 160;
}

function normalizePaper(paper: Paper | undefined): Paper {
  if (paper === "receipt" || paper === "kraft" || paper === "cream") return paper;
  return "cream";
}

function normalizeCorner(corner: Corner | undefined): Corner {
  if (corner === "top-left" || corner === "top-right" || corner === "bottom-left" || corner === "bottom-right") {
    return corner;
  }
  return "bottom-right";
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}
