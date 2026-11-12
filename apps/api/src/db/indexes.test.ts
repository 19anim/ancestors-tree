import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/database.ts';
import { ensureIndexes, MODELS } from './indexes.ts';

useTestDatabase();

describe('ensureIndexes', () => {
  it('covers every model and builds the unique indexes', async () => {
    expect(MODELS.map((model) => model.modelName).sort()).toEqual(mongoose.modelNames().sort());
    await ensureIndexes();
    const removal = MODELS.find((model) => model.modelName === 'ClanRemoval');
    const indexes = await removal?.collection.indexes();
    expect(indexes?.some((index) => index.unique && 'clanId' in index.key)).toBe(true);
  });
});
