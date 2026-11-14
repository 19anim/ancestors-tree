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

  it('is true for text-like roles and inside open menus and listboxes', () => {
    document.body.innerHTML = `
      <div role="textbox" id="tb"></div><div role="combobox" id="cb"></div>
      <div role="searchbox" id="sb"></div><div role="spinbutton" id="sp"></div>
      <div role="menu"><button id="inMenu">m</button></div>
      <div role="listbox"><div role="option" id="inList">l</div></div>
      <button id="plain">y</button>`;
    for (const id of ['tb', 'cb', 'sb', 'sp', 'inMenu', 'inList']) {
      expect(isTypingTarget(document.getElementById(id)), id).toBe(true);
    }
    expect(isTypingTarget(document.getElementById('plain'))).toBe(false);
  });

  it('trusts isContentEditable, which also covers inherited editing', () => {
    document.body.innerHTML = '<div id="host"><span id="inner">x</span></div>';
    const inner = document.getElementById('inner');
    expect(isTypingTarget(inner)).toBe(false);
    Object.defineProperty(inner, 'isContentEditable', { value: true });
    expect(isTypingTarget(inner)).toBe(true);
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
