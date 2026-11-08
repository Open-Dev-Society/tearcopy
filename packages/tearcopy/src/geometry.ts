/** Viewport-space box. Plain data so line merging can be tested without a DOM. */
export type Box = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function union(boxes: readonly Box[]): Box {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const box of boxes) {
    left = Math.min(left, box.left);
    top = Math.min(top, box.top);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const minHeight = Math.min(a.height, b.height);
  if (minHeight > 0 && overlap >= minHeight * 0.45) return true;
  const centerA = (a.top + a.bottom) / 2;
  const centerB = (b.top + b.bottom) / 2;
  return Math.abs(centerA - centerB) <= 0.5 * Math.max(a.height, b.height);
}

/**
 * Collapse per-fragment client rects into one box per visual line.
 * Fragments on the same line (bold, links, inline code) share a box.
 * Zero-area rects are dropped. Reading order is top, then left.
 *
 * ponytail: O(n²) over the selection's fragments. Fine for a copy; switch to a
 * sweep line only if someone copies enormous multi-column text.
 */
export function mergeLineRects(rects: readonly Box[]): Box[] {
  const usable = rects.filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  const sorted = [...usable].sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Box[][] = [];
  for (const rect of sorted) {
    let placed = false;
    for (let i = lines.length - 1; i >= 0; i--) {
      const current = union(lines[i]);
      if (!sameLine(current, rect)) continue;
      lines[i].push(rect);
      placed = true;
      break;
    }
    if (!placed) lines.push([rect]);
  }
  return lines.map(union);
}

export function unionBoxes(boxes: readonly Box[]): Box | null {
  if (boxes.length === 0) return null;
  return union(boxes);
}
