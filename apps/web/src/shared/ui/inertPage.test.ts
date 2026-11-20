import { afterEach, describe, expect, it } from 'vitest';
import { inertPage } from './inertPage';

function add(id: string): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
  document.body.append(element);
  return element;
}

const nextMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  document.body.replaceChildren();
});

describe('inertPage', () => {
  it('makes every other child of the body inert, also those added later, and undoes only that', async () => {
    const app = add('app');
    const dialog = add('dialog');
    const alreadyInert = add('already');
    alreadyInert.setAttribute('inert', '');
    const keep = add('keep');

    const undo = inertPage(keep);
    expect(app).toHaveAttribute('inert');
    expect(dialog).toHaveAttribute('inert');
    expect(keep).not.toHaveAttribute('inert');

    const later = add('later');
    await nextMutations();
    expect(later).toHaveAttribute('inert');

    undo();
    expect(app).not.toHaveAttribute('inert');
    expect(dialog).not.toHaveAttribute('inert');
    expect(later).not.toHaveAttribute('inert');
    // Someone else's inert stays.
    expect(alreadyInert).toHaveAttribute('inert');
  });
});
