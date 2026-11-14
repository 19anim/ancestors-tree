import { describe, expect, it } from 'vitest';
import { isTypingTarget, shortcutAction, shortcutLabel } from './shortcuts';

const key = (
  k: string,
  mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('shortcutAction', () => {
  it('reads Ctrl/⌘+Z as undo, Ctrl/⌘+Shift+Z and Ctrl+Y as redo', () => {
    expect(shortcutAction(key('z', { ctrlKey: true }))).toBe('undo');
    expect(shortcutAction(key('z', { metaKey: true }))).toBe('undo');
    expect(shortcutAction(key('Z', { ctrlKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutAction(key('z', { metaKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutAction(key('y', { ctrlKey: true }))).toBe('redo');
  });

  it('ignores other keys and modifiers', () => {
    expect(shortcutAction(key('z'))).toBeNull();
    expect(shortcutAction(key('z', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(shortcutAction(key('y', { metaKey: true }))).toBeNull();
    expect(shortcutAction(key('x', { ctrlKey: true }))).toBeNull();
  });
});

describe('isTypingTarget', () => {
  it('is true in form fields and dialogs, false elsewhere', () => {
    document.body.innerHTML = `
      <input id="name" /><textarea id="bio"></textarea><div contenteditable="true" id="note"></div>
      <div role="dialog"><button id="inDialog">x</button></div><button id="plain">y</button>`;
    for (const id of ['name', 'bio', 'note', 'inDialog']) {
      expect(isTypingTarget(document.getElementById(id)), id).toBe(true);
    }
    expect(isTypingTarget(document.getElementById('plain'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('shortcutLabel', () => {
  it('shows the keys of the platform', () => {
    expect(shortcutLabel('undo', false)).toBe('Ctrl+Z');
    expect(shortcutLabel('redo', false)).toBe('Ctrl+Y');
    expect(shortcutLabel('undo', true)).toBe('⌘Z');
    expect(shortcutLabel('redo', true)).toBe('⇧⌘Z');
  });
});
