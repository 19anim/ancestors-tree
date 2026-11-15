import { buildTreeIndex, classifyLineage } from './lineage.ts';
import type { Person } from './schemas.ts';
import type { TreeState } from './state.ts';

/** One branch in the Loose photos tray: dragging its root brings everyone (spec §7.6). */
export interface LooseStack {
  rootId: string;
  /** The root first, then a walk down the branch. */
  personIds: string[];
}

function byName(a: Person, b: Person): number {
  return a.fullName.localeCompare(b.fullName, 'vi') || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The unlinked people grouped by branch, each group led by its topmost person: someone with no
 * parent in the group, with the most descendants in it; between tied partners, the one earlier
 * in their union's `partnerIds` (the person who was there first); then by name, then id.
 */
export function looseStacks(tree: TreeState): LooseStack[] {
  const index = buildTreeIndex(tree);
  const lineage = classifyLineage(tree, index);
  const loose = Object.values(tree.persons).filter(
    (person) => lineage.get(person.id) === 'unlinked',
  );
  const looseIds = new Set(loose.map((person) => person.id));

  // Union-find over the loose people, joined by shared unions and parent links.
  const parent = new Map<string, string>(loose.map((person) => [person.id, person.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    parent.set(id, root);
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));
  for (const union of Object.values(tree.unions)) {
    const members = union.partnerIds.filter((id) => looseIds.has(id));
    for (const child of index.childrenOf(union.id))
      if (looseIds.has(child.id)) members.push(child.id);
    for (const other of members.slice(1)) join(members[0] as string, other);
  }

  const groups = new Map<string, Person[]>();
  for (const person of loose) {
    const key = find(person.id);
    groups.set(key, [...(groups.get(key) ?? []), person]);
  }

  const descendants = (id: string, members: ReadonlySet<string>): number => {
    let count = 0;
    const queue = [id];
    const seen = new Set(queue);
    for (let at = 0; at < queue.length; at += 1) {
      for (const union of index.unionsOf(queue[at] as string)) {
        for (const child of index.childrenOf(union.id)) {
          if (members.has(child.id) && !seen.has(child.id)) {
            seen.add(child.id);
            queue.push(child.id);
            count += 1;
          }
        }
      }
    }
    return count;
  };

  const stacks = [...groups.values()].map((members): LooseStack => {
    const ids = new Set(members.map((person) => person.id));
    const hasParentInside = (person: Person) => {
      const unionId = person.parentUnionId;
      return (
        unionId !== undefined && (tree.unions[unionId]?.partnerIds ?? []).some((id) => ids.has(id))
      );
    };
    const candidates = members.filter((person) => !hasParentInside(person));
    const pool = candidates.length > 0 ? candidates : members;
    const counts = new Map(pool.map((person) => [person.id, descendants(person.id, ids)]));
    const most = Math.max(...counts.values());
    const top = pool.filter((person) => counts.get(person.id) === most);
    const topIds = new Set(top.map((person) => person.id));
    // relate puts the person already there first in partnerIds and the added spouse after, so a
    // later partner of another top candidate gives way to them.
    const addedLater = new Set(
      top
        .filter((person) =>
          index.unionsOf(person.id).some((union) => {
            const first = union.partnerIds[0];
            return first !== undefined && first !== person.id && topIds.has(first);
          }),
        )
        .map((person) => person.id),
    );
    const root = [...top].sort(
      (a, b) => Number(addedLater.has(a.id)) - Number(addedLater.has(b.id)) || byName(a, b),
    )[0] as Person;
    // Spouses, then children, breadth first from the root; anyone left after, by name.
    const order = [root.id];
    const seen = new Set(order);
    for (let at = 0; at < order.length; at += 1) {
      for (const union of index.unionsOf(order[at] as string)) {
        for (const id of union.partnerIds) {
          if (ids.has(id) && !seen.has(id)) {
            seen.add(id);
            order.push(id);
          }
        }
        for (const child of index.childrenOf(union.id)) {
          if (ids.has(child.id) && !seen.has(child.id)) {
            seen.add(child.id);
            order.push(child.id);
          }
        }
      }
    }
    for (const person of [...members].sort(byName)) if (!seen.has(person.id)) order.push(person.id);
    return { rootId: root.id, personIds: order };
  });

  return stacks.sort((a, b) =>
    byName(tree.persons[a.rootId] as Person, tree.persons[b.rootId] as Person),
  );
}
