import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('joins class names and skips falsy values', () => {
    const hidden = false;
    expect(cn('flex', hidden && 'hidden', undefined, null, 'gap-2')).toBe('flex gap-2');
  });

  it('lets later Tailwind classes win over conflicting earlier ones', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });
});
