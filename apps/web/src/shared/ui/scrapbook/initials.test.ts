import { describe, expect, it } from 'vitest';
import { initialsOf } from './initials';

describe('initialsOf', () => {
  it('uses the given name, which is the last word of a Vietnamese name', () => {
    expect(initialsOf('Nguyễn Văn Thịnh')).toBe('T');
    expect(initialsOf('  Bà   Hoa ')).toBe('H');
  });

  it('keeps Vietnamese diacritics on the letter', () => {
    expect(initialsOf('Lê Thị ánh')).toBe('Á');
    expect(initialsOf('Ánh')).toBe('Á');
  });

  it('returns a placeholder for empty names', () => {
    expect(initialsOf('   ')).toBe('?');
  });
});
