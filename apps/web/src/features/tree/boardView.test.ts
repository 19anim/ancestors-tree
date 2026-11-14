import { describe, expect, it } from 'vitest';
import { firstNewPerson, isRectVisible, PAN_STEP, panned, personRect } from './boardView';
import { CARD, type TreeLayout } from './layout';

const viewport = { x: 10, y: 20, zoom: 1 };

function layoutOf(...persons: { id: string; x: number; y: number }[]): TreeLayout {
  return {
    persons: persons.map((p) => ({ ...p, tape: 'washi', generation: 1 })),
    unions: [],
    threads: [],
  } as unknown as TreeLayout;
}

describe('panned', () => {
  it('moves the view one step for each arrow key', () => {
    expect(panned(viewport, 'ArrowLeft')).toEqual({ x: 10 + PAN_STEP, y: 20, zoom: 1 });
    expect(panned(viewport, 'ArrowRight')).toEqual({ x: 10 - PAN_STEP, y: 20, zoom: 1 });
    expect(panned(viewport, 'ArrowUp')).toEqual({ x: 10, y: 20 + PAN_STEP, zoom: 1 });
    expect(panned(viewport, 'ArrowDown')).toEqual({ x: 10, y: 20 - PAN_STEP, zoom: 1 });
    expect(panned(viewport, 'Enter')).toBeNull();
  });
});

describe('isRectVisible', () => {
  const size = { width: 400, height: 300 };
  const origin = { x: 0, y: 0, zoom: 1 };

  it('needs the whole card inside the board, with a margin', () => {
    expect(isRectVisible({ x: 20, y: 20, width: 100, height: 100 }, origin, size)).toBe(true);
    expect(isRectVisible({ x: 350, y: 20, width: 100, height: 100 }, origin, size)).toBe(false);
    expect(isRectVisible({ x: 5, y: 20, width: 100, height: 100 }, origin, size)).toBe(false);
  });

  it('counts the pan and the zoom', () => {
    const rect = { x: 300, y: 40, width: 100, height: 100 };
    expect(isRectVisible(rect, origin, size)).toBe(false);
    expect(isRectVisible(rect, { x: -200, y: 0, zoom: 1 }, size)).toBe(true);
    expect(isRectVisible(rect, { x: 0, y: 0, zoom: 0.5 }, size)).toBe(true);
  });
});

describe('personRect and firstNewPerson', () => {
  it('finds a card and the first person who was not there before', () => {
    const layout = layoutOf(
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 300, y: 0 },
      { id: 'c', x: 600, y: 0 },
    );
    expect(personRect(layout, 'b')).toEqual({
      x: 300,
      y: 0,
      width: CARD.width,
      height: CARD.height,
    });
    expect(personRect(layout, 'z')).toBeNull();
    expect(firstNewPerson(new Set(['a']), layout)).toBe('b');
    expect(firstNewPerson(new Set(['a', 'b', 'c', 'd']), layout)).toBeNull();
  });
});
