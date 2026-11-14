import { describe, expect, it } from 'vitest';
import { isObjectId, newObjectId } from './ids.ts';

describe('newObjectId', () => {
  it('makes 24 lowercase hex characters', () => {
    expect(newObjectId()).toMatch(/^[a-f0-9]{24}$/);
  });

  it('starts with the creation time in seconds, like a MongoDB ObjectId', () => {
    const id = newObjectId(Date.UTC(2026, 10, 13, 8, 0, 0));
    expect(Number.parseInt(id.slice(0, 8), 16)).toBe(Date.UTC(2026, 10, 13, 8, 0, 0) / 1000);
  });

  it('never repeats within a process', () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newObjectId(0)));
    expect(ids.size).toBe(10_000);
  });

  it('sorts by creation time', () => {
    const older = newObjectId(Date.UTC(2020, 0, 1));
    const newer = newObjectId(Date.UTC(2030, 0, 1));
    expect(older < newer).toBe(true);
  });
});

describe('isObjectId', () => {
  it('accepts 24 lowercase hex characters only', () => {
    expect(isObjectId('64b7f0c2a1b2c3d4e5f60718')).toBe(true);
    expect(isObjectId('64B7F0C2A1B2C3D4E5F60718')).toBe(false);
    expect(isObjectId('64b7f0c2a1b2c3d4e5f6071')).toBe(false);
    expect(isObjectId(42)).toBe(false);
  });
});
