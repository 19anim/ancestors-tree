import { describe, expect, it } from 'vitest';
import { clanPhotoPrefix, newPhotoPublicId, personPhotoPrefix } from './paths.ts';

describe('photo paths', () => {
  it('nests people under their clan, under the folder', () => {
    expect(clanPhotoPrefix('ancestors-tree/dev', 'c1')).toBe('ancestors-tree/dev/clans/c1/');
    expect(personPhotoPrefix('ancestors-tree/dev', 'c1', 'p1')).toBe(
      'ancestors-tree/dev/clans/c1/people/p1/',
    );
  });

  it('ends a new id with 16 random lowercase hex characters', () => {
    const a = newPhotoPublicId('ancestors-tree/dev', 'c1', 'p1');
    const b = newPhotoPublicId('ancestors-tree/dev', 'c1', 'p1');
    expect(a).toMatch(/^ancestors-tree\/dev\/clans\/c1\/people\/p1\/[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
  });
});
