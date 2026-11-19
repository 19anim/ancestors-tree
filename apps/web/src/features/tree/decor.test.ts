import { EMPTY_VIEW_PREFERENCE } from '@ancestors-tree/shared';
import { describe, expect, it } from 'vitest';
import {
  cardChoice,
  cardPickChangesNothing,
  cardStyleWith,
  changesToMatch,
  showsOwnTheme,
  treeChoice,
  treePick,
  treePickChangesNothing,
  withCardPick,
  withoutCard,
  withTreePick,
} from './decor';

const ID = '64b7f0c2a1b2c3d4e5f6a003';

describe('picks', () => {
  it('a surface brings its matching fastener; other parts go alone', () => {
    expect(treePick('surface', 'fridge')).toEqual({ surface: 'fridge', fastener: 'magnet' });
    expect(treePick('thread', 'yarn')).toEqual({ thread: 'yarn' });
  });

  it('any pick for me turns my theme on, keeping my other choices', () => {
    const off = { enabled: false, theme: { stitch: 'yarn' as const }, cards: {} };
    expect(withTreePick(off, { surface: 'corkboard', fastener: 'pushpin' })).toEqual({
      enabled: true,
      theme: { stitch: 'yarn', surface: 'corkboard', fastener: 'pushpin' },
      cards: {},
    });
    expect(withCardPick(off, ID, 'frame', 'kraft')).toEqual({
      enabled: true,
      theme: { stitch: 'yarn' },
      cards: { [ID]: { frame: 'kraft' } },
    });
  });

  it("sets and removes one part of a card's style", () => {
    expect(cardStyleWith(undefined, 'frame', 'vintage')).toEqual({ frame: 'vintage' });
    expect(cardStyleWith({ frame: 'vintage' }, 'fastener', 'magnet')).toEqual({
      frame: 'vintage',
      fastener: 'magnet',
    });
    expect(cardStyleWith({ frame: 'vintage' }, 'frame', null)).toBeUndefined();
  });

  it('a card pick for me keeps the other part of my card', () => {
    const mine = { enabled: true, theme: {}, cards: { [ID]: { frame: 'kraft' as const } } };
    expect(withCardPick(mine, ID, 'fastener', 'magnet').cards[ID]).toEqual({
      frame: 'kraft',
      fastener: 'magnet',
    });
  });

  it("drops only this card's own choice", () => {
    const mine = { enabled: true, theme: {}, cards: { [ID]: { frame: 'kraft' as const } } };
    expect(withoutCard(mine, ID)).toEqual({ enabled: true, theme: {}, cards: {} });
    expect(withoutCard(mine, 'other')).toBe(mine);
  });
});

describe('"Use for the whole family"', () => {
  it('sends the parts I chose that differ, and leaves the rest to the family', () => {
    expect(changesToMatch({ surface: 'fridge', thread: 'yarn' }, { surface: 'corkboard' })).toEqual(
      { surface: 'corkboard' },
    );
    expect(changesToMatch({ surface: 'fridge' }, { surface: 'fridge' })).toBeNull();
    expect(changesToMatch({}, {})).toBeNull();
  });
});

describe('the banner', () => {
  it('shows while my choices are on and there is at least one', () => {
    expect(showsOwnTheme(null)).toBe(false);
    expect(showsOwnTheme(EMPTY_VIEW_PREFERENCE)).toBe(false);
    expect(showsOwnTheme({ ...EMPTY_VIEW_PREFERENCE, enabled: true })).toBe(false);
    expect(showsOwnTheme({ enabled: true, theme: { thread: 'yarn' }, cards: {} })).toBe(true);
    expect(showsOwnTheme({ enabled: false, theme: { thread: 'yarn' }, cards: {} })).toBe(false);
  });
});

describe('what the panel shows as picked', () => {
  const layers = {
    clan: { surface: 'fridge' as const, frame: 'kraft' as const },
    mine: {
      enabled: true,
      theme: { surface: 'corkboard' as const },
      cards: { [ID]: { fastener: 'magnet' as const } },
    },
  };

  it("shows mine in my mode, and the family's in the family's", () => {
    expect(treeChoice(layers, 'me', 'surface')).toBe('corkboard');
    expect(treeChoice(layers, 'clan', 'surface')).toBe('fridge');
    expect(treeChoice(layers, 'clan', 'stitch')).toBe('cotton');
    expect(
      treeChoice({ ...layers, mine: { ...layers.mine, enabled: false } }, 'me', 'surface'),
    ).toBe('fridge');
  });

  it('says where a card part comes from in each mode', () => {
    expect(cardChoice(layers, 'me', ID, { frame: 'vintage' }, 'fastener')).toEqual({
      value: 'magnet',
      source: 'myCard',
    });
    expect(cardChoice(layers, 'clan', ID, { frame: 'vintage' }, 'fastener')).toEqual({
      value: 'washi',
      source: 'default',
    });
    expect(cardChoice(layers, 'clan', ID, { frame: 'vintage' }, 'frame')).toEqual({
      value: 'vintage',
      source: 'clanCard',
    });
  });
});

describe('a pick that changes nothing', () => {
  const layers = {
    clan: { surface: 'fridge' as const, fastener: 'magnet' as const },
    mine: { enabled: true, theme: { thread: 'yarn' as const }, cards: {} },
  };

  it('is a tree pick whose every part is already in effect in this mode', () => {
    expect(treePickChangesNothing(layers, 'clan', treePick('surface', 'fridge'))).toBe(true);
    expect(treePickChangesNothing(layers, 'clan', treePick('stitch', 'cotton'))).toBe(true);
    expect(treePickChangesNothing(layers, 'clan', treePick('thread', 'yarn'))).toBe(false);
    expect(treePickChangesNothing(layers, 'me', treePick('thread', 'yarn'))).toBe(true);
    // The family's fastener is not the surface's own: picking the surface again brings it back.
    const pinned = { ...layers, clan: { surface: 'fridge' as const, fastener: 'washi' as const } };
    expect(treePickChangesNothing(pinned, 'clan', treePick('surface', 'fridge'))).toBe(false);
  });

  it('is a card pick of the part already in effect in this mode', () => {
    expect(cardPickChangesNothing(layers, 'clan', ID, undefined, 'fastener', 'magnet')).toBe(true);
    expect(cardPickChangesNothing(layers, 'clan', ID, { frame: 'kraft' }, 'frame', 'kraft')).toBe(
      true,
    );
    expect(cardPickChangesNothing(layers, 'clan', ID, { frame: 'kraft' }, 'frame', 'vintage')).toBe(
      false,
    );
  });

  it('is never a pick for me while my choices are off: it turns them on', () => {
    const off = { ...layers, mine: { ...layers.mine, enabled: false } };
    expect(treePickChangesNothing(off, 'me', treePick('surface', 'fridge'))).toBe(false);
    expect(cardPickChangesNothing(off, 'me', ID, undefined, 'fastener', 'magnet')).toBe(false);
    expect(treePickChangesNothing({ ...layers, mine: null }, 'me', { stitch: 'cotton' })).toBe(
      false,
    );
  });
});
