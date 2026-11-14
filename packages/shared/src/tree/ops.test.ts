import { describe, expect, it } from 'vitest';
import { MAX_BATCH_OPS, needsOwner, OpSchema, type Op } from './ops.ts';
import { makePerson, makeUnion, testId } from './testing.ts';

const setProgenitor: Op = { type: 'setProgenitor', payload: { personId: testId(1) } };
const addPerson: Op = { type: 'addPerson', payload: makePerson(testId(1)) };

describe('OpSchema', () => {
  it('parses every op type', () => {
    const ops: Op[] = [
      addPerson,
      { type: 'updatePerson', payload: { id: testId(1), changes: { bio: null } } },
      { type: 'deletePerson', payload: { id: testId(1) } },
      { type: 'addUnion', payload: makeUnion(testId(2), [testId(1)]) },
      { type: 'updateUnion', payload: { id: testId(2), changes: { status: 'divorced' } } },
      { type: 'deleteUnion', payload: { id: testId(2) } },
      { type: 'setParents', payload: { personId: testId(1), parentUnionId: null } },
      { type: 'restorePerson', payload: { person: makePerson(testId(1)), unions: [] } },
      { type: 'restoreUnion', payload: makeUnion(testId(2), [testId(1)]) },
      setProgenitor,
      { type: 'setProgenitor', payload: { personId: null } },
      { type: 'batch', payload: { ops: [addPerson, setProgenitor] } },
    ];
    for (const op of ops) expect(OpSchema.parse(op), op.type).toEqual(op);
  });

  it('rejects unknown types, malformed ids, nested, empty and oversized batches', () => {
    expect(OpSchema.safeParse({ type: 'setTreeTheme', payload: {} }).success).toBe(false);
    expect(OpSchema.safeParse({ type: 'deletePerson', payload: { id: 'x' } }).success).toBe(false);
    const nested = { type: 'batch', payload: { ops: [addPerson] } };
    expect(OpSchema.safeParse({ type: 'batch', payload: { ops: [nested] } }).success).toBe(false);
    expect(OpSchema.safeParse({ type: 'batch', payload: { ops: [] } }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_BATCH_OPS + 1 }, () => setProgenitor);
    expect(OpSchema.safeParse({ type: 'batch', payload: { ops: tooMany } }).success).toBe(false);
  });
});

describe('needsOwner', () => {
  it('is true for setProgenitor, also inside a batch', () => {
    expect(needsOwner(setProgenitor)).toBe(true);
    expect(needsOwner({ type: 'batch', payload: { ops: [addPerson, setProgenitor] } })).toBe(true);
    expect(needsOwner(addPerson)).toBe(false);
    expect(needsOwner({ type: 'batch', payload: { ops: [addPerson] } })).toBe(false);
  });
});
