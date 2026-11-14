import type { Person, Union } from './schemas.ts';
import type { TreeState } from './state.ts';

/** Spec §8: derived, never stored. */
export type Lineage = 'blood' | 'in-law' | 'unlinked';

export interface TreeIndex {
  /** The person's unions by `order`, then id. */
  unionsOf(personId: string): readonly Union[];
  /** The union's children by `siblingOrder` (people without one last), then id. */
  childrenOf(unionId: string): readonly Person[];
}

const NONE: readonly never[] = [];

function byOrder(a: Union, b: Union): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function bySiblingOrder(a: Person, b: Person): number {
  const orderA = a.siblingOrder ?? Number.POSITIVE_INFINITY;
  const orderB = b.siblingOrder ?? Number.POSITIVE_INFINITY;
  if (orderA !== orderB) return orderA < orderB ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Lookups from people to their unions and from unions to their children. */
export function buildTreeIndex(tree: TreeState): TreeIndex {
  const unionsByPerson = new Map<string, Union[]>();
  for (const union of Object.values(tree.unions)) {
    for (const partnerId of union.partnerIds) push(unionsByPerson, partnerId, union);
  }
  const childrenByUnion = new Map<string, Person[]>();
  for (const person of Object.values(tree.persons)) {
    if (person.parentUnionId !== undefined) push(childrenByUnion, person.parentUnionId, person);
  }
  for (const list of unionsByPerson.values()) list.sort(byOrder);
  for (const list of childrenByUnion.values()) list.sort(bySiblingOrder);
  return {
    unionsOf: (personId) => unionsByPerson.get(personId) ?? NONE,
    childrenOf: (unionId) => childrenByUnion.get(unionId) ?? NONE,
  };
}

interface Walk {
  generations: Map<string, number>;
  blood: Set<string>;
}

/**
 * One breadth-first walk down from the progenitor. Blood members are queued; their partners get
 * the same generation but are never walked (in-laws do not expand, spec §8). Descent wins over
 * marriage when someone is both.
 */
function walk(tree: TreeState, index: TreeIndex): Walk {
  const generations = new Map<string, number>();
  const blood = new Set<string>();
  const root = tree.progenitorId;
  if (root === null || !tree.persons[root]) return { generations, blood };
  const queue = [root];
  blood.add(root);
  generations.set(root, 1);
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at] as string;
    const generation = generations.get(id) as number;
    for (const union of index.unionsOf(id)) {
      for (const partnerId of union.partnerIds) {
        if (!generations.has(partnerId)) generations.set(partnerId, generation);
      }
      for (const child of index.childrenOf(union.id)) {
        if (blood.has(child.id)) continue;
        blood.add(child.id);
        generations.set(child.id, generation + 1);
        queue.push(child.id);
      }
    }
  }
  return { generations, blood };
}

/** Spec §5: the progenitor is generation 1; people not linked to them are absent. */
export function computeGenerations(
  tree: TreeState,
  index: TreeIndex = buildTreeIndex(tree),
): ReadonlyMap<string, number> {
  return walk(tree, index).generations;
}

/** Spec §8: one entry per person. */
export function classifyLineage(
  tree: TreeState,
  index: TreeIndex = buildTreeIndex(tree),
): ReadonlyMap<string, Lineage> {
  const { generations, blood } = walk(tree, index);
  const lineage = new Map<string, Lineage>();
  for (const id of Object.keys(tree.persons)) {
    lineage.set(id, blood.has(id) ? 'blood' : generations.has(id) ? 'in-law' : 'unlinked');
  }
  return lineage;
}
