/**
 * Makes every child of <body> but `keep` inert, dialogs and portals included, also those that
 * mount later; returns the undo, which removes only what this call set. For a screen that blocks
 * the whole app (the wake-up screen). A side sheet uses inertOthers, which keeps live regions
 * and dialogs operable.
 */
export function inertPage(keep: Element): () => void {
  const made = new Set<Element>();
  const hide = (element: Element) => {
    if (element === keep || element.contains(keep)) return;
    if (element.tagName === 'SCRIPT' || element.hasAttribute('inert')) return;
    element.setAttribute('inert', '');
    made.add(element);
  };
  for (const child of Array.from(document.body.children)) hide(child);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element && node.parentElement === document.body) hide(node);
      }
    }
  });
  observer.observe(document.body, { childList: true });

  return () => {
    observer.disconnect();
    for (const element of made) element.removeAttribute('inert');
  };
}
