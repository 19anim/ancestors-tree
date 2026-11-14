import {
  treeStateFromLists,
  type Person,
  type TreeState,
  type Union,
} from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { pinPoint } from '../../shared/ui';
import { CARD, layoutTree, ROW_HEIGHT, SPOUSE_GAP, type TreeLayout } from './layout';

const id = (n: number) => n.toString(16).padStart(24, '0');
const A = id(1);
const B = id(2);
const C = id(3);
const D = id(4);
const E = id(5);
const F = id(6);
const G = id(7);
const X = id(9);
const U1 = id(101);
const U2 = id(102);
const U3 = id(103);

function person(personId: string, overrides: Partial<Person> = {}): Person {
  return {
    id: personId,
    fullName: `Person ${personId.slice(-2)}`,
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

function union(unionId: string, partnerIds: string[], order = 1): Union {
  return { id: unionId, partnerIds, order, status: 'married' };
}

function placed(layout: TreeLayout, personId: string) {
  const found = layout.persons.find((candidate) => candidate.id === personId);
  if (!found) throw new Error(`${personId} was not placed`);
  return found;
}

function overlaps(layout: TreeLayout): string[] {
  const problems: string[] = [];
  const cards = layout.persons;
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const a = cards[i] as (typeof cards)[number];
      const b = cards[j] as (typeof cards)[number];
      const apart =
        a.x + CARD.width <= b.x ||
        b.x + CARD.width <= a.x ||
        a.y + CARD.height <= b.y ||
        b.y + CARD.height <= a.y;
      if (!apart) problems.push(`${a.id} overlaps ${b.id}`);
    }
  }
  return problems;
}

/** A + B with children C and D. */
const couple = treeStateFromLists(
  A,
  [
    person(A),
    person(B, { gender: 'female' }),
    person(C, { parentUnionId: U1 }),
    person(D, { parentUnionId: U1 }),
  ],
  [union(U1, [A, B])],
);

describe('layoutTree', () => {
  it('draws nothing without a progenitor and lists everyone as not linked', () => {
    const layout = layoutTree({ ...couple, progenitorId: null });
    expect(layout.persons).toEqual([]);
    expect(layout.unlinked).toEqual([A, B, C, D]);
  });

  it('places a lone progenitor at the origin with the progenitor tape', () => {
    const layout = layoutTree(treeStateFromLists(A, [person(A), person(X)], []));
    expect(layout.persons).toEqual([{ id: A, x: 0, y: 0, tape: 'progenitor', generation: 1 }]);
    expect(layout.unlinked).toEqual([X]);
    expect(layout).toMatchObject({ width: CARD.width, height: CARD.height });
  });

  it('puts a wife beside her husband and their children centred below the stitch', () => {
    const layout = layoutTree(couple);
    const husband = placed(layout, A);
    const wife = placed(layout, B);
    expect(wife.x).toBe(husband.x + CARD.width + SPOUSE_GAP);
    expect(wife.tape).toBe('in-law');
    expect(layout.unions).toEqual([
      {
        id: U1,
        x: husband.x + CARD.width,
        y: 0,
        width: SPOUSE_GAP,
        height: CARD.height,
        couple: true,
      },
    ]);

    const [son, daughter] = [placed(layout, C), placed(layout, D)];
    expect(son.y).toBe(ROW_HEIGHT);
    expect(son.generation).toBe(2);
    expect([son.tape, daughter.tape]).toEqual([0, 1]);
    const knotX = husband.x + CARD.width + SPOUSE_GAP / 2;
    expect((son.x + daughter.x + CARD.width) / 2).toBe(knotX);

    const thread = layout.threads.find((candidate) => candidate.childId === C);
    expect(thread).toEqual({
      childId: C,
      unionId: U1,
      from: { x: knotX, y: CARD.height / 2 },
      dropTo: CARD.height + 8,
      to: pinPoint(son, CARD),
    });
  });

  it('puts a second wife on the left', () => {
    const tree = treeStateFromLists(
      A,
      [person(A), person(B, { gender: 'female' }), person(E, { gender: 'female' })],
      [union(U1, [A, B], 1), union(U2, [A, E], 2)],
    );
    const layout = layoutTree(tree);
    expect(placed(layout, E).x).toBeLessThan(placed(layout, A).x);
    expect(placed(layout, A).x).toBeLessThan(placed(layout, B).x);
  });

  it('hangs the children of a parent without a spouse from a knot under the card', () => {
    const tree = treeStateFromLists(
      A,
      [person(A), person(C, { parentUnionId: U1 })],
      [union(U1, [A])],
    );
    const layout = layoutTree(tree);
    expect(layout.unions).toEqual([
      { id: U1, x: CARD.width / 2 - 6, y: CARD.height - 6, width: 12, height: 12, couple: false },
    ]);
    expect(layout.threads[0]?.from).toEqual({ x: CARD.width / 2, y: CARD.height });
  });

  it('draws a marriage between two relatives once, and each person once', () => {
    // A → C and D (U1, A alone); C → F (U2); D marries F (U3) and they have G.
    const tree = treeStateFromLists(
      A,
      [
        person(A),
        person(C, { parentUnionId: U1 }),
        person(D, { parentUnionId: U1, gender: 'female' }),
        person(F, { parentUnionId: U2 }),
        person(G, { parentUnionId: U3 }),
      ],
      [union(U1, [A]), union(U2, [C]), union(U3, [D, F])],
    );
    const layout = layoutTree(tree);
    expect(layout.persons.map((p) => p.id).sort()).toEqual([A, C, D, F, G].sort());
    expect(layout.unions.filter((u) => u.id === U3)).toHaveLength(1);
    expect(layout.threads.filter((t) => t.childId === G)).toHaveLength(1);
    expect(overlaps(layout)).toEqual([]);
  });

  it('never overlaps cards and always hangs children below their parents', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const tree = randomFamily(seed, 120);
      const layout = layoutTree(tree);
      expect(layout.unlinked, `seed ${seed}`).toEqual([]);
      expect(layout.persons, `seed ${seed}`).toHaveLength(Object.keys(tree.persons).length);
      expect(overlaps(layout), `seed ${seed}`).toEqual([]);
      for (const thread of layout.threads) {
        expect(thread.to.y, `seed ${seed}`).toBeGreaterThan(thread.dropTo);
        expect(thread.dropTo, `seed ${seed}`).toBeGreaterThan(thread.from.y);
      }
    }
  });
});

/** A random descendant tree with spouses and second marriages; deterministic per seed. */
function randomFamily(seed: number, size: number): TreeState {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  let next = 1;
  const newId = () => id((next += 1) * 7);
  const root = newId();
  const persons: Person[] = [person(root)];
  const unions: Union[] = [];
  const blood = [root];
  while (persons.length < size) {
    const parent = blood[Math.floor(random() * blood.length)] as string;
    const own = unions.filter((u) => u.partnerIds.includes(parent));
    if (random() < 0.3 && own.length < 3) {
      const spouse = newId();
      persons.push(person(spouse, { gender: 'female' }));
      unions.push(union(newId(), [parent, spouse], own.length + 1));
      continue;
    }
    let target = own[Math.floor(random() * own.length)];
    if (!target) {
      target = union(newId(), [parent]);
      unions.push(target);
    }
    const child = newId();
    persons.push(person(child, { parentUnionId: target.id }));
    blood.push(child);
  }
  return treeStateFromLists(root, persons, unions);
}
