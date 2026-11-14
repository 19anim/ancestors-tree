import { describe, expect, it } from 'vitest';
import { invariantViolations, makePerson, makeUnion, testId, treeOf } from './testing.ts';

describe('invariantViolations', () => {
  it('accepts a valid tree', () => {
    const tree = treeOf([makePerson(testId(1))], [makeUnion(testId(2), [testId(1)])]);
    expect(invariantViolations(tree)).toEqual([]);
  });

  it('flags an id used by a person and a union', () => {
    const tree = treeOf([makePerson(testId(1))], [makeUnion(testId(1), [testId(1)])]);
    expect(invariantViolations(tree)).toContain(`id ${testId(1)} is both a person and a union`);
  });

  it('does not take inherited keys for unions or people', () => {
    const orphan = treeOf([makePerson(testId(1), { parentUnionId: 'constructor' })]);
    expect(invariantViolations(orphan)).toContain(`person ${testId(1)} points at a missing union`);
    const ghost = treeOf([], [makeUnion(testId(2), ['toString'])]);
    expect(invariantViolations(ghost)).toContain(`union ${testId(2)} has a missing partner`);
  });
});
