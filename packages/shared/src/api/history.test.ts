import { describe, expect, it } from 'vitest';
import { HISTORY_PAGE_MAX, HISTORY_PAGE_SIZE, HistoryQuerySchema } from './history.ts';

describe('HistoryQuerySchema', () => {
  it('reads query strings and defaults the page size', () => {
    expect(HistoryQuerySchema.parse({})).toEqual({ limit: HISTORY_PAGE_SIZE });
    expect(HistoryQuerySchema.parse({ before: '12', limit: '5' })).toEqual({
      before: 12,
      limit: 5,
    });
  });

  it('refuses a page that is too big and a seq below 1', () => {
    expect(HistoryQuerySchema.safeParse({ limit: String(HISTORY_PAGE_MAX + 1) }).success).toBe(
      false,
    );
    expect(HistoryQuerySchema.safeParse({ before: '0' }).success).toBe(false);
  });
});
