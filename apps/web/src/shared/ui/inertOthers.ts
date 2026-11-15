/**
 * Live regions stay out of reach of `inert`, so their messages are still announced. A region's
 * own controls stay operable on purpose: TreeNoticeBanner (`role="alert"`) keeps its dismiss and
 * sign-in buttons, since what it says can matter more than the sheet.
 */
const LIVE_REGION = '[aria-live], [role="status"], [role="alert"], [role="log"]';
/** An element that takes focus itself is made inert whole, even around a live region. */
const FOCUSABLE = '[tabindex], a[href], button, input, select, textarea, [contenteditable]';
/** A dialog opened on top (portalled to the body) must stay usable. */
const MODAL_LAYER = '[role="dialog"], [role="alertdialog"], [aria-modal="true"]';

/**
 * Makes everything on the page but `keep` inert (no focus, no clicks, out of the accessibility
 * tree), as a modal does; returns the undo. Live regions are left alone, with the way down to
 * them (unless that way takes focus itself), and so are dialogs on top and anything already
 * inert. What mounts later beside the walked path (the board replacing its "no progenitor" text,
 * a tray, a notice) gets the same treatment. The undo removes only what this call set.
 */
export function inertOthers(keep: Element): () => void {
  const made = new Set<Element>();
  /** The elements whose children were sorted: their new children are sorted as they come. */
  const walked = new Set<Element>();
  let observer: MutationObserver | null = null;
  const walk = (element: Element) => {
    if (walked.has(element)) return;
    walked.add(element);
    observer?.observe(element, { childList: true });
  };
  const hide = (element: Element) => {
    if (element === keep || element.contains(keep)) return;
    if (element.hasAttribute('inert') || element.tagName === 'SCRIPT') return;
    if (element.matches(LIVE_REGION) || element.matches(MODAL_LAYER)) return;
    if (element.querySelector(MODAL_LAYER) !== null) return;
    if (!element.matches(FOCUSABLE) && element.querySelector(LIVE_REGION) !== null) {
      walk(element);
      for (const child of Array.from(element.children)) hide(child);
      return;
    }
    element.setAttribute('inert', '');
    made.add(element);
  };
  for (let node = keep; node !== document.body;) {
    const parent = node.parentElement;
    if (parent === null) break;
    walk(parent);
    for (const sibling of Array.from(parent.children)) hide(sibling);
    node = parent;
  }

  // A container walked into later (it holds a live region) is watched from then on, by walk().
  const watching = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element && node.isConnected) hide(node);
      }
    }
  });
  observer = watching;
  for (const element of walked) watching.observe(element, { childList: true });

  return () => {
    watching.disconnect();
    for (const element of made) element.removeAttribute('inert');
  };
}
