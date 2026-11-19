import { describe, expect, it } from 'vitest';
import { ViewPreferenceSchema } from '../api/viewPreference.ts';
import { applyOp } from './apply-op.ts';
import { newObjectId } from './ids.ts';
import { OpSchema, type Op } from './ops.ts';
import { PersonChangesSchema } from './schemas.ts';
import { EMPTY_TREE } from './state.ts';
import {
  CardStyleSchema,
  cardPartSource,
  MATCHING_FASTENER,
  resolveBoardStyle,
  resolveCardStyle,
  THEME_DEFAULTS,
  TreeThemeChangesSchema,
  TreeThemeSchema,
  type PersonalTheme,
} from './theme.ts';

const ID = newObjectId();

function mine(overrides: Partial<PersonalTheme> = {}): PersonalTheme {
  return { enabled: true, theme: {}, cards: {}, ...overrides };
}

describe('theme schemas', () => {
  it('accepts known options only', () => {
    expect(TreeThemeSchema.parse({ surface: 'corkboard', thread: 'yarn' })).toEqual({
      surface: 'corkboard',
      thread: 'yarn',
    });
    expect(TreeThemeSchema.safeParse({ surface: 'chalkboard' }).success).toBe(false);
    expect(TreeThemeSchema.safeParse({ colour: 'red' }).success).toBe(false);
  });

  it('resets a part with null, and needs at least one part', () => {
    expect(TreeThemeChangesSchema.parse({ surface: null })).toEqual({ surface: null });
    expect(TreeThemeChangesSchema.safeParse({}).success).toBe(false);
  });

  it('a card style names a frame or a fastener, and updatePerson clears it with null', () => {
    expect(CardStyleSchema.safeParse({}).success).toBe(false);
    expect(CardStyleSchema.safeParse({ surface: 'fridge' }).success).toBe(false);
    expect(PersonChangesSchema.parse({ cardStyle: null })).toEqual({ cardStyle: null });
    expect(PersonChangesSchema.parse({ cardStyle: { frame: 'kraft' } })).toEqual({
      cardStyle: { frame: 'kraft' },
    });
  });

  it('matches each surface with its fastener, and has a default for every part', () => {
    expect(MATCHING_FASTENER).toEqual({
      'grid-paper': 'washi',
      corkboard: 'pushpin',
      fridge: 'magnet',
    });
    expect(THEME_DEFAULTS).toEqual({
      surface: 'grid-paper',
      frame: 'classic',
      fastener: 'washi',
      thread: 'cotton',
      stitch: 'cotton',
    });
  });
});

describe('ViewPreferenceSchema', () => {
  it('takes ObjectId keys only, and at most 5,000 cards', () => {
    const ok = { enabled: true, theme: {}, cards: { [ID]: { frame: 'vintage' } } };
    expect(ViewPreferenceSchema.safeParse(ok).success).toBe(true);
    const badKey = { enabled: true, theme: {}, cards: { 'not-an-id': { frame: 'vintage' } } };
    expect(ViewPreferenceSchema.safeParse(badKey).success).toBe(false);
    const many = Object.fromEntries(
      Array.from({ length: 5001 }, () => [newObjectId(), { frame: 'kraft' }]),
    );
    expect(ViewPreferenceSchema.safeParse({ enabled: true, theme: {}, cards: many }).success).toBe(
      false,
    );
  });
});

describe('setTreeTheme', () => {
  it('sets parts, resets them with null, and its inverse holds exactly the previous values', () => {
    const op: Op = {
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard', fastener: 'pushpin' } },
    };
    expect(OpSchema.parse(op)).toEqual(op);
    const first = applyOp(EMPTY_TREE, op);
    expect(first.tree.theme).toEqual({ surface: 'corkboard', fastener: 'pushpin' });
    expect(first.inverse).toEqual({
      type: 'setTreeTheme',
      payload: { changes: { surface: null, fastener: null } },
    });

    const second = applyOp(first.tree, {
      type: 'setTreeTheme',
      payload: { changes: { surface: null, thread: 'yarn' } },
    });
    expect(second.tree.theme).toEqual({ fastener: 'pushpin', thread: 'yarn' });
    expect(second.inverse).toEqual({
      type: 'setTreeTheme',
      payload: { changes: { surface: 'corkboard', thread: null } },
    });
    expect(applyOp(second.tree, second.inverse).tree).toEqual(first.tree);
  });

  it('keeps the people and unions objects', () => {
    const { tree } = applyOp(EMPTY_TREE, {
      type: 'setTreeTheme',
      payload: { changes: { stitch: 'yarn' } },
    });
    expect(tree.persons).toBe(EMPTY_TREE.persons);
    expect(tree.unions).toBe(EMPTY_TREE.unions);
  });
});

describe('resolveCardStyle, layer by layer (spec §13.4)', () => {
  const clan = { frame: 'kraft', fastener: 'magnet' } as const;

  it('5: falls back to the defaults', () => {
    const layers = { clan: {}, mine: null };
    expect(resolveCardStyle(layers, ID)).toEqual({ frame: 'classic', fastener: 'washi' });
    expect(cardPartSource(layers, ID, undefined, 'frame')).toBe('default');
  });

  it("4: the clan's tree theme", () => {
    expect(resolveCardStyle({ clan, mine: null }, ID)).toEqual({
      frame: 'kraft',
      fastener: 'magnet',
    });
    expect(cardPartSource({ clan, mine: null }, ID, undefined, 'fastener')).toBe('clanTree');
  });

  it("3: my tree theme beats the clan's, only while enabled", () => {
    const layers = { clan, mine: mine({ theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(layers, ID)).toEqual({ frame: 'vintage', fastener: 'magnet' });
    expect(cardPartSource(layers, ID, undefined, 'frame')).toBe('myTree');
    const off = { clan, mine: mine({ enabled: false, theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(off, ID).frame).toBe('kraft');
  });

  it("2: the clan's choice for this card beats both tree themes", () => {
    const layers = { clan, mine: mine({ theme: { frame: 'vintage' } }) };
    expect(resolveCardStyle(layers, ID, { frame: 'classic' })).toEqual({
      frame: 'classic',
      fastener: 'magnet',
    });
    expect(cardPartSource(layers, ID, { frame: 'classic' }, 'frame')).toBe('clanCard');
  });

  it('1: my choice for this card beats everything, part by part', () => {
    const layers = { clan, mine: mine({ cards: { [ID]: { fastener: 'pushpin' } } }) };
    expect(resolveCardStyle(layers, ID, { frame: 'vintage', fastener: 'washi' })).toEqual({
      frame: 'vintage',
      fastener: 'pushpin',
    });
    expect(cardPartSource(layers, ID, { fastener: 'washi' }, 'fastener')).toBe('myCard');
    // Another card has no entry of its own.
    expect(resolveCardStyle(layers, newObjectId()).fastener).toBe('magnet');
  });

  it('never reads a card entry from Object.prototype', () => {
    expect(resolveCardStyle({ clan: {}, mine: mine() }, 'constructor')).toEqual({
      frame: 'classic',
      fastener: 'washi',
    });
  });
});

describe('resolveBoardStyle (layers 3–5)', () => {
  it("uses my tree theme while enabled, then the clan's, then the defaults", () => {
    expect(resolveBoardStyle({ clan: {}, mine: null })).toEqual({
      surface: 'grid-paper',
      thread: 'cotton',
      stitch: 'cotton',
    });
    expect(resolveBoardStyle({ clan: { surface: 'fridge', stitch: 'yarn' }, mine: null })).toEqual({
      surface: 'fridge',
      thread: 'cotton',
      stitch: 'yarn',
    });
    const layers = {
      clan: { surface: 'fridge' as const },
      mine: mine({ theme: { surface: 'corkboard', thread: 'yarn' } }),
    };
    expect(resolveBoardStyle(layers)).toEqual({
      surface: 'corkboard',
      thread: 'yarn',
      stitch: 'cotton',
    });
    const off = {
      clan: { surface: 'fridge' as const },
      mine: mine({ enabled: false, theme: { surface: 'corkboard' } }),
    };
    expect(resolveBoardStyle(off).surface).toBe('fridge');
  });
});
