import { describe, expect, it } from 'vitest';
import { MODELS } from '../db/indexes.ts';
import { CLAN_SCOPED_MODEL_NAMES } from './scoped.ts';

describe('CLAN_SCOPED_MODEL_NAMES', () => {
  it('lists every model that belongs to a clan', () => {
    const scoped = MODELS.filter((model) => model.schema.path('clanId') !== undefined).map(
      (model) => model.modelName,
    );
    expect([...CLAN_SCOPED_MODEL_NAMES].sort()).toEqual(scoped.sort());
  });
});
