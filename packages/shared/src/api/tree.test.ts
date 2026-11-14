import { describe, expect, it } from 'vitest';
import { OpsQuerySchema, SubmitOpRequestSchema, TreeResponseSchema } from './tree.ts';

describe('tree API contracts', () => {
  it('reads `since` from a query string and defaults it to 0', () => {
    expect(OpsQuerySchema.parse({ since: '12' })).toEqual({ since: 12 });
    expect(OpsQuerySchema.parse({})).toEqual({ since: 0 });
    expect(OpsQuerySchema.safeParse({ since: '-1' }).success).toBe(false);
  });

  it('needs a base version with every op', () => {
    const op = { type: 'setProgenitor', payload: { personId: null } };
    const expectedUserId = '64b7f0c2a1b2c3d4e5f60718';
    const parse = (request: object) => SubmitOpRequestSchema.safeParse(request).success;
    expect(parse({ op, baseVersion: 3, expectedUserId })).toBe(true);
    expect(parse({ op, expectedUserId })).toBe(false);
    expect(parse({ op, baseVersion: -1, expectedUserId })).toBe(false);
    expect(parse({ op, baseVersion: 3 })).toBe(false);
  });

  it('takes at most one revert field, each at least 1', () => {
    const base = {
      op: { type: 'setProgenitor', payload: { personId: null } },
      baseVersion: 3,
      expectedUserId: '64b7f0c2a1b2c3d4e5f60718',
    };
    const parse = (extra: object) => SubmitOpRequestSchema.safeParse({ ...base, ...extra }).success;
    expect(parse({ revertsSeq: 1 })).toBe(true);
    expect(parse({ revertsToSeq: 2 })).toBe(true);
    expect(parse({ revertsSeq: 0 })).toBe(false);
    expect(parse({ revertsSeq: 1, revertsToSeq: 2 })).toBe(false);
  });

  it('describes an empty tree', () => {
    const empty = { version: 0, progenitorId: null, persons: [], unions: [] };
    expect(TreeResponseSchema.parse(empty)).toEqual(empty);
  });
});
