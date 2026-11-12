import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './useReducedMotion';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useReducedMotion', () => {
  it('is false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('follows the media query and its changes', () => {
    let notify: () => void = () => undefined;
    const query = {
      matches: true,
      addEventListener: vi.fn((_event: string, listener: () => void) => {
        notify = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => query),
    );

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);

    act(() => {
      query.matches = false;
      notify();
    });
    expect(result.current).toBe(false);
  });
});
