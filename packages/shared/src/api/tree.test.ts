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
    expect(SubmitOpRequestSchema.safeParse({ op, baseVersion: 3 }).success).toBe(true);
    expect(SubmitOpRequestSchema.safeParse({ op }).success).toBe(false);
    expect(SubmitOpRequestSchema.safeParse({ op, baseVersion: -1 }).success).toBe(false);
  });

  it('describes an empty tree', () => {
    const empty = { version: 0, progenitorId: null, persons: [], unions: [] };
    expect(TreeResponseSchema.parse(empty)).toEqual(empty);
  });
});
