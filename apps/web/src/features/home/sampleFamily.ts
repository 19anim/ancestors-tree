import type { TapeKind } from '../../shared/ui';

/** Content for the home page and the design gallery — not UI copy, so not in the locales. */
export interface SamplePerson {
  id: string;
  name: string;
  years: string;
  tape: TapeKind;
  /** Top-left corner of the full polaroid on the board. */
  x: number;
  y: number;
  deathAnniversary?: string;
  birthday?: string;
}

export const SAMPLE_BOARD = { width: 560, height: 420 } as const;

export const SAMPLE_PEOPLE: readonly SamplePerson[] = [
  {
    id: 'thinh',
    name: 'Ông Thịnh',
    years: '1931–2004',
    tape: 'progenitor',
    x: 170,
    y: 40,
    deathAnniversary: '15/10',
  },
  {
    id: 'hoa',
    name: 'Bà Hoa',
    years: '1935–2019',
    tape: 'in-law',
    x: 298,
    y: 40,
    deathAnniversary: '02/03',
  },
  { id: 'tuan', name: 'Bố Tuấn', years: '1962', tape: 0, x: 90, y: 240 },
  { id: 'lan', name: 'Mẹ Lan', years: '1965', tape: 'in-law', x: 218, y: 240, birthday: '21/11' },
  { id: 'ha', name: 'Cô Hà', years: '1968', tape: 1, x: 376, y: 240, birthday: '08/03' },
];

export const SAMPLE_MARRIAGES: ReadonlyArray<readonly [string, string]> = [
  ['thinh', 'hoa'],
  ['tuan', 'lan'],
];

export const SAMPLE_CHILDREN: ReadonlyArray<{
  child: string;
  parents: readonly [string, string];
}> = [
  { child: 'tuan', parents: ['thinh', 'hoa'] },
  { child: 'ha', parents: ['thinh', 'hoa'] },
];
