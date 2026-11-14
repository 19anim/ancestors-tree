import {
  buildTreeIndex,
  classifyLineage,
  computeGenerations,
  type TreeState,
} from '@ancestors-tree/shared/tree';
import { pinPoint, POLAROID_SIZE, THREAD_DROP, type Point, type TapeKind } from '../../shared/ui';

export const CARD = POLAROID_SIZE.full;
/** Between a person and their spouse; the marriage stitch runs through it. */
export const SPOUSE_GAP = 48;
/** Between neighbouring subtrees. */
export const SIBLING_GAP = 40;
/** Between generations; threads drop and bend here. */
export const ROW_GAP = 96;
export const ROW_HEIGHT = CARD.height + ROW_GAP;
/** The knot under a parent who has children without a spouse on the board. */
export const KNOT_SIZE = 12;

export interface PlacedPerson {
  id: string;
  x: number;
  y: number;
  tape: TapeKind;
  generation: number;
}

export interface PlacedUnion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True: a stitch between two cards. False: a knot under one card. */
  couple: boolean;
}

export interface PlacedThread {
  childId: string;
  unionId: string;
  from: Point;
  dropTo: number;
  to: Point;
}

export interface TreeLayout {
  persons: PlacedPerson[];
  unions: PlacedUnion[];
  threads: PlacedThread[];
  /** Not linked to the progenitor: listed in the tray, not drawn. Sorted by id. */
  unlinked: string[];
  width: number;
  height: number;
}

interface UnionBlock {
  unionId: string;
  /** The in-law drawn beside the unit's person, or null when the union hangs from a knot. */
  spouseId: string | null;
  children: Unit[];
}

/** A blood member, the spouses drawn beside them and their children's units (spec §7.4). */
interface Unit {
  personId: string;
  /** Index of the progenitor's child this person descends from; null for the progenitor. */
  branch: number | null;
  rights: string[];
  lefts: string[];
  unions: UnionBlock[];
  rowWidth: number;
  width: number;
}

const STEP = CARD.width + SPOUSE_GAP;

function rowWidthOf(cards: number): number {
  return cards * CARD.width + (cards - 1) * SPOUSE_GAP;
}

export function layoutTree(tree: TreeState): TreeLayout {
  const index = buildTreeIndex(tree);
  const lineage = classifyLineage(tree, index);
  const generations = computeGenerations(tree, index);
  const result: TreeLayout = {
    persons: [],
    unions: [],
    threads: [],
    unlinked: [],
    width: 0,
    height: 0,
  };
  const drawn = new Set<string>();
  const claimed = new Set<string>();
  let nextBranch = 0;

  // Steps 2 and 3: build the units depth-first and size them on the way back up.
  function buildUnit(personId: string, branch: number | null): Unit {
    drawn.add(personId);
    const unit: Unit = {
      personId,
      branch,
      rights: [],
      lefts: [],
      unions: [],
      rowWidth: 0,
      width: 0,
    };
    for (const union of index.unionsOf(personId)) {
      if (claimed.has(union.id)) continue;
      claimed.add(union.id);
      const partner = union.partnerIds.find((partnerId) => partnerId !== personId);
      let spouseId: string | null = null;
      if (partner !== undefined && !drawn.has(partner) && lineage.get(partner) !== 'blood') {
        drawn.add(partner);
        (unit.rights.length <= unit.lefts.length ? unit.rights : unit.lefts).push(partner);
        spouseId = partner;
      }
      const children: Unit[] = [];
      for (const child of index.childrenOf(union.id)) {
        if (drawn.has(child.id)) continue;
        children.push(buildUnit(child.id, branch ?? nextBranch++));
      }
      unit.unions.push({ unionId: union.id, spouseId, children });
    }
    unit.rowWidth = rowWidthOf(1 + unit.rights.length + unit.lefts.length);
    const children = unit.unions.flatMap((block) => block.children);
    const childrenWidth =
      children.reduce((sum, child) => sum + child.width, 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP;
    unit.width = Math.max(unit.rowWidth, childrenWidth);
    return unit;
  }

  function tapeOf(personId: string, unit: Unit): TapeKind {
    if (personId === tree.progenitorId) return 'progenitor';
    if (personId !== unit.personId) return 'in-law';
    return unit.branch ?? 0;
  }

  // Step 4: positions top-down. Returns the x of the unit's own card.
  function place(unit: Unit, left: number, top: number): number {
    const rowLeft = left + (unit.width - unit.rowWidth) / 2;
    const row = [...[...unit.lefts].reverse(), unit.personId, ...unit.rights];
    const xOf = new Map<string, number>();
    row.forEach((personId, position) => {
      const x = rowLeft + position * STEP;
      xOf.set(personId, x);
      result.persons.push({
        id: personId,
        x,
        y: top,
        tape: tapeOf(personId, unit),
        generation: generations.get(personId) ?? 0,
      });
    });
    result.height = Math.max(result.height, top + CARD.height);
    const selfX = rowLeft + unit.lefts.length * STEP;

    const knots = unit.unions.map((block) => {
      const spouseX = block.spouseId === null ? undefined : xOf.get(block.spouseId);
      if (spouseX !== undefined) {
        const x = Math.min(selfX, spouseX) + CARD.width;
        const width = Math.max(selfX, spouseX) - x;
        result.unions.push({
          id: block.unionId,
          x,
          y: top,
          width,
          height: CARD.height,
          couple: true,
        });
        return { block, knot: { x: x + width / 2, y: top + CARD.height / 2 } };
      }
      const knot = { x: selfX + CARD.width / 2, y: top + CARD.height };
      if (block.children.length > 0) {
        result.unions.push({
          id: block.unionId,
          x: knot.x - KNOT_SIZE / 2,
          y: knot.y - KNOT_SIZE / 2,
          width: KNOT_SIZE,
          height: KNOT_SIZE,
          couple: false,
        });
      }
      return { block, knot };
    });

    const withChildren = knots
      .filter(({ block }) => block.children.length > 0)
      .sort((a, b) => a.knot.x - b.knot.x);
    const children = withChildren.flatMap(({ block }) => block.children);
    const total =
      children.reduce((sum, child) => sum + child.width, 0) +
      Math.max(0, children.length - 1) * SIBLING_GAP;
    let cursor = left + (unit.width - total) / 2;
    const childTop = top + ROW_HEIGHT;
    for (const { block, knot } of withChildren) {
      for (const child of block.children) {
        const childX = place(child, cursor, childTop);
        result.threads.push({
          childId: child.personId,
          unionId: block.unionId,
          from: knot,
          dropTo: top + CARD.height + THREAD_DROP,
          to: pinPoint({ x: childX, y: childTop }, CARD),
        });
        cursor += child.width + SIBLING_GAP;
      }
    }
    return selfX;
  }

  const root = tree.progenitorId;
  if (root !== null && tree.persons[root]) {
    const unit = buildUnit(root, null);
    place(unit, 0, 0);
    result.width = unit.width;
  }
  result.unlinked = Object.keys(tree.persons)
    .filter((personId) => !drawn.has(personId))
    .sort();
  return result;
}
