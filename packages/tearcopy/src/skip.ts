const NON_TEXT_INPUTS = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "file",
  "color",
  "range",
  "image",
  "hidden",
]);

function elementOf(target: EventTarget | Node | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/** True when a copy from this node should not tear (fields, editables, opt-outs, shadow DOM). */
export function inSkippedRegion(target: EventTarget | Node | null): boolean {
  if (target instanceof Node && target.getRootNode() instanceof ShadowRoot) return true;
  const element = elementOf(target);
  if (!element) return false;
  if (element.closest("[data-tearcopy-ignore]")) return true;
  const editable = element.closest("[contenteditable]");
  if (editable && editable.getAttribute("contenteditable") !== "false") return true;
  const field = element.closest("textarea, select, input");
  if (field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) return true;
  if (field instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(field.type);
  return false;
}

/**
 * Decide whether this copy should stay visually quiet.
 * A focused text field wins even if a stale document selection still exists,
 * because the browser copies the field, not the page.
 */
export function isSkippedCopy(eventTarget: EventTarget | null, selection: Selection | null): boolean {
  if (typeof document !== "undefined" && inSkippedRegion(document.activeElement)) return true;
  if (inSkippedRegion(eventTarget)) return true;
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return true;
  if (!selection.toString().trim()) return true;
  if (inSkippedRegion(selection.anchorNode) || inSkippedRegion(selection.focusNode)) return true;
  return false;
}
