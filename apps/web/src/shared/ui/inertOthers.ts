/** Live regions stay out of reach of `inert`, so their messages are still announced. */
const LIVE_REGION = '[aria-live], [role="status"], [role="alert"], [role="log"]';
/** An element that takes focus itself is made inert whole, even around a live region. */
const FOCUSABLE = '[tabindex], a[href], button, input, select, textarea, [contenteditable]';

/**
 * Makes everything on the page but `keep` inert (no focus, no clicks, out of the accessibility
 * tree), as a modal does; returns the undo. Live regions are left alone, with the way down to
 * them (unless that way takes focus itself), and so is anything already inert. Elements added
 * later are not touched.
 */
export function inertOthers(keep: Element): () => void {
  const made: Element[] = [];
  const hide = (element: Element) => {
    if (element.hasAttribute('inert') || element.tagName === 'SCRIPT') return;
    if (element.matches(LIVE_REGION)) return;
    if (!element.matches(FOCUSABLE) && element.querySelector(LIVE_REGION) !== null) {
      for (const child of Array.from(element.children)) hide(child);
      return;
    }
    element.setAttribute('inert', '');
    made.push(element);
  };
  for (let node = keep; node !== document.body;) {
    const parent = node.parentElement;
    if (parent === null) break;
    for (const sibling of Array.from(parent.children)) if (sibling !== node) hide(sibling);
    node = parent;
  }
  return () => {
    for (const element of made) element.removeAttribute('inert');
  };
}
