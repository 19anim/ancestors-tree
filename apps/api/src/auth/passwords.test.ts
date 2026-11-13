import { describe, expect, it } from 'vitest';
import { createPasswords } from './passwords.ts';

// Cost 4 keeps tests fast; production uses BCRYPT_COST (12).
const passwords = createPasswords(4);

describe('passwords', () => {
  it('hashes with bcrypt and verifies the right password only', async () => {
    const hash = await passwords.hash('mat-khau-dai');
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(hash).not.toContain('mat-khau-dai');
    expect(await passwords.verify('mat-khau-dai', hash)).toBe(true);
    expect(await passwords.verify('mat-khau-sai', hash)).toBe(false);
  });

  it('rejects accounts without a password', async () => {
    expect(await passwords.verify('anything', undefined)).toBe(false);
    expect(await passwords.verify('anything', null)).toBe(false);
  });
});
