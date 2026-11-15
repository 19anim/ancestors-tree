import { afterEach, describe, expect, it } from 'vitest';
import { personCardButton } from './profileParams';

afterEach(() => {
  document.body.replaceChildren();
});

describe('personCardButton', () => {
  it('finds the card when it is shown', () => {
    document.body.innerHTML = '<button data-person-open="a"></button>';
    expect(personCardButton('a')).toBe(document.querySelector('[data-person-open="a"]'));
  });

  it('finds the toggle of the collapsed stack that holds the card', () => {
    document.body.innerHTML = `
      <button data-stack-toggle="root"></button>
      <ul hidden data-stack-of="root"><li><button data-person-open="a"></button></li></ul>`;
    expect(personCardButton('a')).toBe(document.querySelector('[data-stack-toggle="root"]'));
  });

  it('is null when the card is missing, or hidden outside a stack', () => {
    document.body.innerHTML = '<div hidden><button data-person-open="a"></button></div>';
    expect(personCardButton('a')).toBeNull();
    expect(personCardButton('b')).toBeNull();
  });
});
