import { describe, expect, it } from 'vitest';
import { treeOpenedBy } from './treePaths';

describe('treeOpenedBy', () => {
  it('knows the pages that load a family tree', () => {
    expect(treeOpenedBy('/clans/abc')).toBe('abc');
    expect(treeOpenedBy('/clans/abc/tree')).toBe('abc');
    expect(treeOpenedBy('/clans/abc/history')).toBe('abc');
    expect(treeOpenedBy('/clans/abc/members')).toBeNull();
    expect(treeOpenedBy('/clans')).toBeNull();
  });
});
