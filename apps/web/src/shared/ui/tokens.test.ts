import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import tokensCss from './tokens.css?raw';

function declarations(selector: string): Map<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(tokensCss)?.[1];
  if (block === undefined) throw new Error(`Block "${selector}" not found in tokens.css`);
  const result = new Map<string, string>();
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    if (name && value) result.set(name, value.trim().toLowerCase());
  }
  return result;
}

const light = declarations(':root');
const darkOverrides = declarations(":root[data-theme='dark']");
const dark = new Map([...light, ...darkOverrides]);

const THEMED = [
  '--paper',
  '--paper-grid',
  '--surface',
  '--ink',
  '--ink-muted',
  '--line',
  '--line-strong',
  '--stamp',
  '--on-stamp',
  '--accent',
  '--on-accent',
  '--success',
  '--photo',
  '--thread',
  '--pin',
];

const TAPES = [
  '--tape-progenitor',
  '--tape-1',
  '--tape-2',
  '--tape-3',
  '--tape-4',
  '--tape-5',
  '--tape-6',
  '--tape-in-law',
  '--tape-loose',
];

/** Text (or icon) on background: WCAG AA 4.5:1. */
const TEXT_PAIRS: Array<[string, string]> = [
  ['--ink', '--paper'],
  ['--ink', '--surface'],
  ['--ink-muted', '--paper'],
  ['--ink-muted', '--surface'],
  ['--stamp', '--paper'],
  ['--stamp', '--surface'],
  ['--accent', '--paper'],
  ['--accent', '--surface'],
  ['--paper', '--ink'],
  ['--on-accent', '--accent'],
  ['--on-stamp', '--stamp'],
  ['--on-sticker', '--sticker'],
  ['--photo-ink', '--photo'],
  ['--photo-muted', '--photo'],
  ['--photo-stamp', '--photo'],
];

/** Borders, lines, focus rings and status dots: WCAG 1.4.11 3:1. */
const NON_TEXT_PAIRS: Array<[string, string]> = [
  ['--line-strong', '--paper'],
  ['--line-strong', '--surface'],
  ['--success', '--paper'],
  ['--thread', '--paper'],
  ['--pin', '--paper'],
];

describe('design tokens', () => {
  it('redefines exactly the themed tokens in the dark theme', () => {
    expect([...darkOverrides.keys()].sort()).toEqual([...THEMED].sort());
  });

  it('uses #rrggbb values for every color token', () => {
    for (const [name, value] of [...light, ...darkOverrides]) {
      if (name.startsWith('--duration-')) continue;
      expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('defines the washi tape palette', () => {
    for (const name of TAPES) expect(light.has(name), name).toBe(true);
  });

  it('maps every Tailwind color to a defined token', () => {
    const theme = declarations('@theme inline');
    expect(theme.size).toBeGreaterThan(0);
    for (const [name, value] of theme) {
      const reference = /^var\((--[\w-]+)\)$/.exec(value)?.[1] ?? '';
      expect(light.has(reference), `${name}: ${value}`).toBe(true);
    }
  });

  for (const [themeName, tokens] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`meets 4.5:1 text contrast in the ${themeName} theme`, () => {
      for (const [foreground, background] of TEXT_PAIRS) {
        const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
        expect(
          ratio,
          `${foreground} on ${background} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`meets 3:1 non-text contrast in the ${themeName} theme`, () => {
      for (const [foreground, background] of NON_TEXT_PAIRS) {
        const ratio = contrastRatio(tokens.get(foreground) ?? '', tokens.get(background) ?? '');
        expect(
          ratio,
          `${foreground} on ${background} = ${ratio.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
