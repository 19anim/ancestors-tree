export type ShortcutAction = 'undo' | 'redo';

type KeyInfo = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>;

/** Spec §6.4: Ctrl/⌘+Z undoes; Ctrl/⌘+Shift+Z and Ctrl+Y redo. */
export function shortcutAction(event: KeyInfo): ShortcutAction | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return 'redo';
  return null;
}

/**
 * Shortcuts are ignored while typing (the field's own undo wins) and while a dialog is open
 * (the change would happen behind it).
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="dialog"], [role="alertdialog"]',
    ) !== null
  );
}

export function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad/.test(navigator.userAgent);
}

/** The keys shown in the tooltip. */
export function shortcutLabel(action: ShortcutAction, mac: boolean): string {
  if (mac) return action === 'undo' ? '⌘Z' : '⇧⌘Z';
  return action === 'undo' ? 'Ctrl+Z' : 'Ctrl+Y';
}

/** For aria-keyshortcuts. */
export const KEY_SHORTCUTS: Record<ShortcutAction, string> = {
  undo: 'Control+Z Meta+Z',
  redo: 'Control+Shift+Z Meta+Shift+Z Control+Y',
};
