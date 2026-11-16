import { treeStateFromLists } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import {
  areSiblings,
  clampedPan,
  dropChange,
  edgePan,
  MAX_PAN_FRAME_MS,
  PAN_FRAME_MS,
  PAN_STOP_MARGIN,
  panFor,
  pointerOf,
  TRAY_ID,
  zoneAt,
  zoneFor,
  zoneResults,
} from './dragZones';
import { FAMILY, GRANDPA, LOOSE, SIBLINGS, SISTER, SON } from './fixtures';

const RECT = { left: 100, top: 100, width: 100, height: 150 };
const family = treeStateFromLists(FAMILY.progenitorId, FAMILY.persons, FAMILY.unions);
const siblings = treeStateFromLists(SIBLINGS.progenitorId, SIBLINGS.persons, SIBLINGS.unions);

describe('zoneAt', () => {
  it('uses thirds for parent, spouse and child', () => {
    expect(zoneAt({ x: 150, y: 110 }, RECT, false)).toBe('parent');
    expect(zoneAt({ x: 150, y: 175 }, RECT, false)).toBe('spouse');
    expect(zoneAt({ x: 150, y: 240 }, RECT, false)).toBe('child');
  });

  it('uses the left and right fifths for siblings only', () => {
    expect(zoneAt({ x: 105, y: 175 }, RECT, true)).toBe('before');
    expect(zoneAt({ x: 195, y: 175 }, RECT, true)).toBe('after');
    expect(zoneAt({ x: 105, y: 175 }, RECT, false)).toBe('spouse');
  });
});

describe('the drop', () => {
  it('knows siblings', () => {
    expect(areSiblings(siblings, SON, SISTER)).toBe(true);
    expect(areSiblings(siblings, SON, GRANDPA)).toBe(false);
    expect(areSiblings(family, LOOSE, GRANDPA)).toBe(false);
  });

  it('plans every zone of a target once, with the sibling edges only for siblings', () => {
    expect(Object.keys(zoneResults(family, LOOSE, SON) ?? {})).toEqual([
      'parent',
      'spouse',
      'child',
    ]);
    expect(Object.keys(zoneResults(siblings, SISTER, SON) ?? {})).toEqual([
      'parent',
      'spouse',
      'child',
      'before',
      'after',
    ]);
    expect(zoneResults(family, SON, SON)).toBeNull();
    expect(zoneResults(family, SON, null)).toBeNull();
    // Someone already loose, dropped back on the tray: nothing to do, so a cancel.
    expect(zoneResults(family, LOOSE, TRAY_ID)).toBeNull();
    expect(zoneResults(family, SON, TRAY_ID)?.tray?.kind).toBe('ok');
  });

  it('cancels on empty space and on the card’s own place', () => {
    expect(dropChange(SON, null, null)).toBeNull();
    expect(dropChange(SON, SON, 'child')).toBeNull();
    expect(dropChange(LOOSE, SON, 'child')).toEqual({
      kind: 'relate',
      personId: LOOSE,
      targetId: SON,
      relation: 'child',
    });
    expect(dropChange(SON, TRAY_ID, 'tray')).toEqual({ kind: 'detach', personId: SON });
  });

  it('picks the zone from the pointer, or the tray', () => {
    const results = zoneResults(family, LOOSE, SON);
    expect(zoneFor(SON, LOOSE, { x: 150, y: 240 }, RECT, results)).toBe('child');
    expect(zoneFor(TRAY_ID, SON, { x: 0, y: 0 }, null, zoneResults(family, SON, TRAY_ID))).toBe(
      'tray',
    );
    expect(zoneFor(null, SON, { x: 0, y: 0 }, null, null)).toBeNull();
  });
});

describe('pointer and edges', () => {
  it('follows the pointer from where the drag started', () => {
    const start = new MouseEvent('mousedown', { clientX: 10, clientY: 20 });
    expect(pointerOf({ activatorEvent: start, delta: { x: 5, y: -3 } })).toEqual({ x: 15, y: 17 });
  });

  it('pans towards the edge the pointer is near, and not from the middle or outside', () => {
    const board = { left: 0, top: 0, width: 800, height: 600 };
    expect(edgePan({ x: 10, y: 300 }, board)).toEqual({ x: 12, y: 0 });
    expect(edgePan({ x: 790, y: 590 }, board)).toEqual({ x: -12, y: -12 });
    expect(edgePan({ x: 400, y: 300 }, board)).toBeNull();
    expect(edgePan({ x: -5, y: 300 }, board)).toBeNull();
  });

  it('pans as far per second at any refresh rate, and no further after a stall', () => {
    expect(panFor({ x: 12, y: 0 }, PAN_FRAME_MS)).toEqual({ x: 12, y: 0 });
    // 120 Hz: half a 60 Hz step per frame.
    expect(panFor({ x: -12, y: 12 }, PAN_FRAME_MS / 2)).toEqual({ x: -6, y: 6 });
    expect(panFor({ x: 12, y: 0 }, 10_000)).toEqual(panFor({ x: 12, y: 0 }, MAX_PAN_FRAME_MS));
  });

  it('stops panning once the tree’s edge is in view', () => {
    const board = { width: 800, height: 600 };
    const tree = { width: 2000, height: 1000 };
    // The tree's left edge is off screen: the pan reveals it, up to the margin.
    expect(clampedPan({ x: -100, y: 0, zoom: 1 }, { x: 12, y: 0 }, board, tree)).toEqual({
      x: -88,
      y: 0,
      zoom: 1,
    });
    expect(
      clampedPan({ x: PAN_STOP_MARGIN - 5, y: 0, zoom: 1 }, { x: 12, y: 0 }, board, tree),
    ).toEqual({ x: PAN_STOP_MARGIN, y: 0, zoom: 1 });
    expect(
      clampedPan({ x: PAN_STOP_MARGIN, y: 0, zoom: 1 }, { x: 12, y: 0 }, board, tree),
    ).toBeNull();
    // Its right edge (at half zoom, 1000 px wide) is already PAN_STOP_MARGIN inside the board.
    const farRight = 800 - PAN_STOP_MARGIN - 1000;
    expect(clampedPan({ x: farRight, y: 0, zoom: 0.5 }, { x: -12, y: 0 }, board, tree)).toBeNull();
    // A tree smaller than the board never pans away.
    const small = { width: 200, height: 100 };
    expect(clampedPan({ x: 300, y: 250, zoom: 1 }, { x: 12, y: -12 }, board, small)).toBeNull();
  });
});
