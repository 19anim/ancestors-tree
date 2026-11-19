import { afterEach, describe, expect, it } from 'vitest';
import { inertOthers } from './inertOthers';

afterEach(() => {
  document.body.innerHTML = '';
});

const byId = (id: string) => document.getElementById(id) as HTMLElement;
const isInert = (id: string) => byId(id).hasAttribute('inert');
/** MutationObserver callbacks run in a microtask after the change. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('makes what mounts later inert too, but not a dialog on top, and undoes only its own', async () => {
    document.body.innerHTML = `
      <header id="header"><button>Menu</button></header>
      <main id="main">
        <div id="column">
          <p id="status" role="status"></p>
          <p id="no-progenitor">Chưa chọn thuỷ tổ</p>
        </div>
        <aside id="sheet"><button>Close</button></aside>
      </main>`;
    const undo = inertOthers(byId('sheet'));
    const mount = (parent: HTMLElement, id: string, html = '') => {
      const element = document.createElement('div');
      element.id = id;
      element.innerHTML = html;
      parent.append(element);
      return element;
    };
    // The board replaces the text once a progenitor is chosen; a notice and a tray appear.
    byId('no-progenitor').remove();
    mount(byId('column'), 'board', '<button>Nguyễn Văn Nam, đời thứ 2</button>').tabIndex = 0;
    mount(byId('main'), 'tray', '<button>Trần Văn Bình</button>');
    mount(document.body, 'banner', '<div role="alert"><button>Đóng</button></div>');
    // A dialog opened from the sheet, portalled to the body: it must stay usable.
    mount(document.body, 'portal', '<div role="dialog"><button>Xoá</button></div>');
    await flush();

    expect(isInert('board')).toBe(true);
    expect(isInert('tray')).toBe(true);
    // A live region stays operable on purpose (TreeNoticeBanner's dismiss button).
    expect(byId('banner').closest('[inert]')).toBeNull();
    expect(byId('portal').closest('[inert]')).toBeNull();

    undo();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    // Not watching any more.
    mount(byId('column'), 'later', '<button>Sau</button>');
    await flush();
    expect(isInert('later')).toBe(false);
  });

  it('leaves what stays operable on purpose (the change toast) usable, buttons and all', async () => {
    document.body.innerHTML = `
      <main id="main">
        <div id="column"><div id="toolbar"><button>Undo</button></div></div>
        <aside id="sheet"><button>Close</button></aside>
      </main>
      <div id="toast" data-stays-operable>
        <p role="status" aria-live="polite">Saved</p>
        <button id="toast-undo">Undo this change</button>
      </div>`;
    const undo = inertOthers(byId('sheet'));
    // Mounted later, beside the walked path: still left alone.
    const later = document.createElement('div');
    later.id = 'later-toast';
    later.setAttribute('data-stays-operable', '');
    later.innerHTML = '<button>Dismiss</button>';
    byId('main').append(later);
    await flush();

    expect(isInert('column')).toBe(true);
    expect(byId('toast-undo').closest('[inert]')).toBeNull();
    expect(byId('later-toast').closest('[inert]')).toBeNull();
    undo();
  });
});
