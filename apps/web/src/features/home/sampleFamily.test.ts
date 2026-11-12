import { describe, expect, it } from 'vitest';
import { POLAROID_SIZE } from '../../shared/ui';
import { SAMPLE_BOARD, SAMPLE_CHILDREN, SAMPLE_MARRIAGES, SAMPLE_PEOPLE } from './sampleFamily';

const ids = new Set(SAMPLE_PEOPLE.map((person) => person.id));

describe('sample family', () => {
  it('has unique ids', () => {
    expect(ids.size).toBe(SAMPLE_PEOPLE.length);
  });

  it('only links people who exist', () => {
    for (const [a, b] of SAMPLE_MARRIAGES) {
      expect(ids.has(a) && ids.has(b), `${a} + ${b}`).toBe(true);
    }
    for (const { child, parents } of SAMPLE_CHILDREN) {
      expect(
        [child, ...parents].every((id) => ids.has(id)),
        child,
      ).toBe(true);
    }
  });

  it('keeps every card and its pin inside the board', () => {
    const { width, height } = POLAROID_SIZE.full;
    for (const person of SAMPLE_PEOPLE) {
      expect(person.x >= 0 && person.x + width <= SAMPLE_BOARD.width, person.id).toBe(true);
      expect(person.y >= 20 && person.y + height <= SAMPLE_BOARD.height, person.id).toBe(true);
    }
  });
});
