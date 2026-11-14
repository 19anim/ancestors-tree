import type { Person, Union } from './schemas.ts';
import { treeStateFromLists, type TreeState } from './state.ts';

/** A readable, valid ObjectId for tests: testId(1) = "000…001". */
export function testId(n: number): string {
  return n.toString(16).padStart(24, '0');
}

export function makePerson(id: string, overrides: Partial<Person> = {}): Person {
  return {
    id,
    fullName: `Person ${id.slice(-4)}`,
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

export function makeUnion(id: string, partnerIds: string[], overrides: Partial<Union> = {}): Union {
  return { id, partnerIds, order: 1, status: 'married', ...overrides };
}

export function treeOf(
  persons: Person[],
  unions: Union[] = [],
  progenitorId: string | null = null,
): TreeState {
  return treeStateFromLists(progenitorId, persons, unions);
}

/** Independent of apply-op.ts on purpose: a second, simpler cycle check. */
function isOwnAncestorSlow(tree: TreeState, personId: string): boolean {
  const seen = new Set<string>();
  const stack = [personId];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    const unionId = tree.persons[current]?.parentUnionId;
    const union = unionId === undefined ? undefined : tree.unions[unionId];
    for (const parentId of union?.partnerIds ?? []) {
      if (parentId === personId) return true;
      if (!seen.has(parentId)) {
        seen.add(parentId);
        stack.push(parentId);
      }
    }
  }
  return false;
}

/** Every broken tree invariant as a short message; [] for a valid tree. */
export function invariantViolations(tree: TreeState): string[] {
  const problems: string[] = [];
  for (const [id, person] of Object.entries(tree.persons)) {
    if (person.id !== id) problems.push(`person ${id} is stored under another id`);
    if (person.parentUnionId !== undefined && !tree.unions[person.parentUnionId]) {
      problems.push(`person ${id} points at a missing union`);
    }
    if (isOwnAncestorSlow(tree, id)) problems.push(`person ${id} is their own ancestor`);
  }
  for (const [id, union] of Object.entries(tree.unions)) {
    if (union.id !== id) problems.push(`union ${id} is stored under another id`);
    const partners = union.partnerIds;
    if (partners.length < 1 || partners.length > 2 || new Set(partners).size !== partners.length) {
      problems.push(`union ${id} has wrong partners`);
    }
    for (const partnerId of partners) {
      if (!tree.persons[partnerId]) problems.push(`union ${id} has a missing partner`);
    }
  }
  if (tree.progenitorId !== null && !tree.persons[tree.progenitorId]) {
    problems.push('the progenitor is missing');
  }
  return problems;
}
