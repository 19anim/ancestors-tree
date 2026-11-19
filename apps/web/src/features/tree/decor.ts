import type { ViewPreference } from '@ancestors-tree/shared';
import {
  cardPartSource,
  MATCHING_FASTENER,
  resolveCardStyle,
  THEME_DEFAULTS,
  THEME_PARTS,
  type CardPart,
  type CardStyle,
  type Surface,
  type ThemeLayers,
  type ThemePart,
  type ThemeSource,
  type TreeTheme,
  type TreeThemeChanges,
} from '@ancestors-tree/shared/tree';

/** Who a pick is for (spec §13.4): only me, or the whole clan. */
export type DecorMode = 'me' | 'clan';

/** What the Decorate panel decorates: the whole tree, or one card. */
export type DecorTarget = { kind: 'tree' } | { kind: 'card'; personId: string };

/** A tree-level pick as theme parts: a surface brings its matching fastener (spec §13.4). */
export function treePick(part: ThemePart, value: string): TreeTheme {
  if (part === 'surface') {
    const surface = value as Surface;
    return { surface, fastener: MATCHING_FASTENER[surface] };
  }
  return { [part]: value } as TreeTheme;
}

/** My choices after a tree-level pick. Any pick in "Only me" turns them on (spec §13.4). */
export function withTreePick(preference: ViewPreference, pick: TreeTheme): ViewPreference {
  return { ...preference, enabled: true, theme: { ...preference.theme, ...pick } };
}

/**
 * A card's style with one part set, or removed with null; undefined once no part is left. The
 * other part stays, so a "Whole family" card pick sends the whole merged style.
 */
export function cardStyleWith(
  style: CardStyle | undefined,
  part: CardPart,
  value: string | null,
): CardStyle | undefined {
  const next: Record<string, string> = { ...style };
  if (value === null) delete next[part];
  else next[part] = value;
  return Object.keys(next).length === 0 ? undefined : (next as CardStyle);
}

function ownCard(preference: ViewPreference, personId: string): CardStyle | undefined {
  return Object.hasOwn(preference.cards, personId) ? preference.cards[personId] : undefined;
}

/** My choices after a pick for one card, keeping its other part; turns them on. */
export function withCardPick(
  preference: ViewPreference,
  personId: string,
  part: CardPart,
  value: string,
): ViewPreference {
  const style = { ...ownCard(preference, personId), [part]: value } as CardStyle;
  return { ...preference, enabled: true, cards: { ...preference.cards, [personId]: style } };
}

/** My choices without this card's own one ("Use the tree's style" in "Only me"). */
export function withoutCard(preference: ViewPreference, personId: string): ViewPreference {
  if (!Object.hasOwn(preference.cards, personId)) return preference;
  const cards = { ...preference.cards };
  delete cards[personId];
  return { ...preference, cards };
}

/**
 * "Use for the whole family": the parts of my tree theme that differ from the clan's. Parts I
 * never chose stay the clan's, so the shared board ends up looking as mine did. Null when it
 * already does.
 */
export function changesToMatch(clan: TreeTheme, mine: TreeTheme): TreeThemeChanges | null {
  const changes: Record<string, string> = {};
  for (const part of THEME_PARTS) {
    const value = mine[part];
    if (value !== undefined && value !== clan[part]) changes[part] = value;
  }
  return Object.keys(changes).length === 0 ? null : (changes as TreeThemeChanges);
}

/** "You are viewing your own theme": my choices are on, and there is at least one. */
export function showsOwnTheme(preference: ViewPreference | null): boolean {
  if (preference === null || !preference.enabled) return false;
  return Object.keys(preference.theme).length > 0 || Object.keys(preference.cards).length > 0;
}

/** The layers as a mode sees them: "Whole family" leaves my own choices out. */
function layersFor(layers: ThemeLayers, mode: DecorMode): ThemeLayers {
  return mode === 'me' ? layers : { clan: layers.clan, mine: null };
}

/** The option a tree-level row shows as picked in this mode. */
export function treeChoice(layers: ThemeLayers, mode: DecorMode, part: ThemePart): string {
  const mine = layersFor(layers, mode).mine;
  const own = mine !== null && mine.enabled ? mine.theme[part] : undefined;
  return own ?? layers.clan[part] ?? THEME_DEFAULTS[part];
}

/** The option a card row shows as picked in this mode, and the layer it comes from. */
export function cardChoice(
  layers: ThemeLayers,
  mode: DecorMode,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: CardPart,
): { value: string; source: ThemeSource } {
  const view = layersFor(layers, mode);
  return {
    value: resolveCardStyle(view, personId, cardStyle)[part],
    source: cardPartSource(view, personId, cardStyle, part),
  };
}

/** A pick for me always turns my choices on, so it changes something while they are off. */
function myChoicesOff(layers: ThemeLayers, mode: DecorMode): boolean {
  return mode === 'me' && !(layers.mine?.enabled ?? false);
}

/**
 * True when a tree-level pick (from `treePick`) would change nothing: every part it sets is
 * already in effect in this mode. The panel skips such a pick, so "Whole family" never sends a
 * change the runner would refuse as ALREADY.
 */
export function treePickChangesNothing(
  layers: ThemeLayers,
  mode: DecorMode,
  pick: TreeTheme,
): boolean {
  if (myChoicesOff(layers, mode)) return false;
  return THEME_PARTS.every(
    (part) => pick[part] === undefined || pick[part] === treeChoice(layers, mode, part),
  );
}

/** True when a card pick would change nothing: that part of the card is already `value`. */
export function cardPickChangesNothing(
  layers: ThemeLayers,
  mode: DecorMode,
  personId: string,
  cardStyle: CardStyle | undefined,
  part: CardPart,
  value: string,
): boolean {
  if (myChoicesOff(layers, mode)) return false;
  return cardChoice(layers, mode, personId, cardStyle, part).value === value;
}
