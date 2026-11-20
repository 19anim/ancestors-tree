import { z } from 'zod';

/** The first option set of spec §13.4. The first value of each list is the default. */
export const SURFACES = ['grid-paper', 'corkboard', 'fridge'] as const;
export const CARD_FRAMES = ['classic', 'kraft', 'vintage'] as const;
export const CARD_FASTENERS = ['washi', 'pushpin', 'magnet'] as const;
export const LINE_STYLES = ['cotton', 'yarn'] as const;

export const SurfaceSchema = z.enum(SURFACES);
export const CardFrameSchema = z.enum(CARD_FRAMES);
export const CardFastenerSchema = z.enum(CARD_FASTENERS);
export const LineStyleSchema = z.enum(LINE_STYLES);

export type Surface = z.infer<typeof SurfaceSchema>;
export type CardFrame = z.infer<typeof CardFrameSchema>;
export type CardFastener = z.infer<typeof CardFastenerSchema>;
export type LineStyle = z.infer<typeof LineStyleSchema>;

/** Every part of a theme and its options, in the order the Decorate panel lists them. */
export const THEME_OPTIONS = {
  surface: SURFACES,
  frame: CARD_FRAMES,
  fastener: CARD_FASTENERS,
  thread: LINE_STYLES,
  stitch: LINE_STYLES,
} as const;

export type ThemePart = keyof typeof THEME_OPTIONS;
export type ThemeValue<P extends ThemePart> = (typeof THEME_OPTIONS)[P][number];
export const THEME_PARTS = Object.keys(THEME_OPTIONS) as ThemePart[];

/** The parts one card can choose for itself. */
export const CARD_PARTS = ['frame', 'fastener'] as const;
export type CardPart = (typeof CARD_PARTS)[number];

/** The parts that belong to the whole board: a thread or stitch joins two people. */
export const BOARD_PARTS = ['surface', 'thread', 'stitch'] as const;
export type BoardPart = (typeof BOARD_PARTS)[number];

export const THEME_DEFAULTS = {
  surface: 'grid-paper',
  frame: 'classic',
  fastener: 'washi',
  thread: 'cotton',
  stitch: 'cotton',
} as const satisfies { [P in ThemePart]: ThemeValue<P> };

/** Choosing a surface also picks its fastener (spec §13.4); it can be changed afterwards. */
export const MATCHING_FASTENER: Record<Surface, CardFastener> = {
  'grid-paper': 'washi',
  corkboard: 'pushpin',
  fridge: 'magnet',
};

/** A tree theme (spec §5): every part optional; a missing part falls through to the next layer. */
export const TreeThemeSchema = z.strictObject({
  surface: SurfaceSchema.optional(),
  frame: CardFrameSchema.optional(),
  fastener: CardFastenerSchema.optional(),
  thread: LineStyleSchema.optional(),
  stitch: LineStyleSchema.optional(),
});
export type TreeTheme = z.infer<typeof TreeThemeSchema>;

/** The parts a `setTreeTheme` op changes; null resets a part to the default (spec §6.1). */
export const TreeThemeChangesSchema = z
  .strictObject({
    surface: SurfaceSchema.nullable().optional(),
    frame: CardFrameSchema.nullable().optional(),
    fastener: CardFastenerSchema.nullable().optional(),
    thread: LineStyleSchema.nullable().optional(),
    stitch: LineStyleSchema.nullable().optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'Send at least one part to change',
  });
export type TreeThemeChanges = z.infer<typeof TreeThemeChangesSchema>;

/** One card's own choice (spec §5). Removing the last part removes the style. */
export const CardStyleSchema = z
  .strictObject({
    frame: CardFrameSchema.optional(),
    fastener: CardFastenerSchema.optional(),
  })
  .refine((style) => style.frame !== undefined || style.fastener !== undefined, {
    message: 'A card style names a frame or a fastener',
  });
export type CardStyle = z.infer<typeof CardStyleSchema>;

/** "Only for me": one member's own decoration of one clan (spec §5 `ViewPreference`). */
export interface PersonalTheme {
  enabled: boolean;
  theme: TreeTheme;
  cards: Readonly<Record<string, CardStyle>>;
}

/** The layers of spec §13.4 that do not live on the card itself. */
export interface ThemeLayers {
  /** The clan's tree theme (`Clan.theme`). */
  clan: TreeTheme;
  /** My own choices; null where nobody's own choices apply (exports and share links, P10). */
  mine: PersonalTheme | null;
}

export type BoardStyle = { surface: Surface; thread: LineStyle; stitch: LineStyle };
export type ResolvedCardStyle = { frame: CardFrame; fastener: CardFastener };

/** The layer a card part's value comes from (spec §13.4, steps 1–5). */
export type ThemeSource = 'myCard' | 'clanCard' | 'myTree' | 'clanTree' | 'default';

function activeMine(layers: ThemeLayers): PersonalTheme | null {
  return layers.mine !== null && layers.mine.enabled ? layers.mine : null;
}

function myCardStyle(mine: PersonalTheme | null, personId: string): CardStyle | undefined {
  return mine !== null && Object.hasOwn(mine.cards, personId) ? mine.cards[personId] : undefined;
}

export function cardPartSource(
  layers: ThemeLayers,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: CardPart,
): ThemeSource {
  const mine = activeMine(layers);
  if (myCardStyle(mine, personId)?.[part] !== undefined) return 'myCard';
  if (cardStyle?.[part] !== undefined) return 'clanCard';
  if (mine?.theme[part] !== undefined) return 'myTree';
  if (layers.clan[part] !== undefined) return 'clanTree';
  return 'default';
}

function cardPart<P extends CardPart>(
  layers: ThemeLayers,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: P,
): ThemeValue<P> {
  const mine = activeMine(layers);
  const value =
    myCardStyle(mine, personId)?.[part] ??
    cardStyle?.[part] ??
    mine?.theme[part] ??
    layers.clan[part] ??
    THEME_DEFAULTS[part];
  return value as ThemeValue<P>;
}

/** A card's frame and fastener: a card beats the whole tree, and mine beats the clan's. */
export function resolveCardStyle(
  layers: ThemeLayers,
  personId: string,
  cardStyle?: CardStyle,
): ResolvedCardStyle {
  return {
    frame: cardPart(layers, personId, cardStyle, 'frame'),
    fastener: cardPart(layers, personId, cardStyle, 'fastener'),
  };
}

/** The board's surface and line styles: my tree theme, the clan's, the default (steps 3–5). */
export function resolveBoardStyle(layers: ThemeLayers): BoardStyle {
  const mine = activeMine(layers)?.theme;
  const pick = <P extends BoardPart>(part: P): ThemeValue<P> =>
    (mine?.[part] ?? layers.clan[part] ?? THEME_DEFAULTS[part]) as ThemeValue<P>;
  return { surface: pick('surface'), thread: pick('thread'), stitch: pick('stitch') };
}
