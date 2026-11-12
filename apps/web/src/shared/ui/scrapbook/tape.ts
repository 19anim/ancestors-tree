/**
 * Which washi tape a card wears. A number is the index of the person's branch (the child
 * of the progenitor the person descends from); it cycles through the Okabe–Ito palette.
 */
export type TapeKind = 'progenitor' | 'in-law' | 'loose' | number;

export const BRANCH_TAPE_COUNT = 6;

export function tapeColor(tape: TapeKind): string {
  if (tape === 'progenitor') return 'var(--tape-progenitor)';
  if (tape === 'in-law') return 'var(--tape-in-law)';
  if (tape === 'loose') return 'var(--tape-loose)';
  const branch = Math.abs(Math.trunc(tape)) % BRANCH_TAPE_COUNT;
  return `var(--tape-${branch + 1})`;
}
