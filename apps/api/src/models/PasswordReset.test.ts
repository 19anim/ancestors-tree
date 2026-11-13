import { describe, expect, it } from 'vitest';
import { useTestDatabase } from '../test/database.ts';
import { PasswordReset } from './PasswordReset.ts';

useTestDatabase();

describe('PasswordReset indexes', () => {
  it('deletes documents 24 h after creation, not at expiresAt', async () => {
    await PasswordReset.init();
    const indexes = await PasswordReset.collection.indexes();
    const ttl = indexes.filter((index) => index.expireAfterSeconds !== undefined);
    expect(ttl).toHaveLength(1);
    expect(ttl[0]?.key).toEqual({ createdAt: 1 });
    expect(ttl[0]?.expireAfterSeconds).toBe(86400);
  });
});
