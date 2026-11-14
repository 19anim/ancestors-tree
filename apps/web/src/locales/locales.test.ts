import { ERROR_CODE_LIST } from '@ancestors-tree/shared';
import { OP_ERROR_CODE_LIST } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { CLIENT_ONLY_ERROR_CODES } from '../shared/lib/apiError';
import en from './en.json';
import vi from './vi.json';

function flatten(value: unknown, prefix = ''): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return { [prefix]: value };
  return Object.entries(value).reduce<Record<string, unknown>>(
    (acc, [key, child]) => ({ ...acc, ...flatten(child, prefix ? `${prefix}.${key}` : key) }),
    {},
  );
}

describe('locales', () => {
  const viFlat = flatten(vi);
  const enFlat = flatten(en);

  it('translate every rule-violation reason', () => {
    for (const reason of OP_ERROR_CODE_LIST) {
      expect(vi.tree.rules, reason).toHaveProperty(reason);
      expect(en.tree.rules, reason).toHaveProperty(reason);
    }
  });

  it('define exactly the same keys in vi and en', () => {
    expect(Object.keys(enFlat).sort()).toEqual(Object.keys(viFlat).sort());
  });

  it('have no empty strings', () => {
    for (const [locale, flat] of [
      ['vi', viFlat],
      ['en', enFlat],
    ] as const) {
      for (const [key, value] of Object.entries(flat)) {
        expect(typeof value === 'string' && value.trim().length > 0, `${locale}:${key}`).toBe(true);
      }
    }
  });

  it('translate every server and client error code', () => {
    for (const code of [...ERROR_CODE_LIST, ...CLIENT_ONLY_ERROR_CODES]) {
      expect(vi.errors, code).toHaveProperty(code);
      expect(en.errors, code).toHaveProperty(code);
    }
  });
});
