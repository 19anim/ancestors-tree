import { afterEach, describe, expect, it } from 'vitest';
import { inertOthers } from './inertOthers';

afterEach(() => {
  document.body.innerHTML = '';
});

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const isInert = (id: string) => byId(id).hasAttribute('inert');

describe('inertOthers', () => {
  it('makes the rest of the page inert, keeps live regions announced, and undoes it all', () => {
    document.body.innerHTML = `
      <header id="header"><button>Menu</button></header>
      <main id="main">
        <div id="column">
          <div id="toolbar"><button>Undo</button></div>
          <p id="status" role="status"></p>
          <div id="board" tabindex="0"><div id="flow-live" aria-live="assertive"></div></div>
        </div>
        <aside id="sheet"><button id="close">Close</button></aside>
      </main>
      <footer id="footer" inert></footer>`;
    const undo = inertOthers(byId('sheet'));

    expect(isInert('header')).toBe(true);
    expect(isInert('toolbar')).toBe(true);
    // A board that takes focus goes inert whole, live region and all.
    expect(isInert('board')).toBe(true);
    // The way down to a live region stays, and so does the region.
    expect(isInert('main')).toBe(false);
    expect(isInert('column')).toBe(false);
    expect(isInert('status')).toBe(false);
    expect(byId('sheet').closest('[inert]')).toBeNull();

    undo();
    expect(document.querySelectorAll('[inert]')).toHaveLength(1);
    // Inert before, so not ours to undo.
    expect(isInert('footer')).toBe(true);
  });
});
