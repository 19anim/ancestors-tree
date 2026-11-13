import { assertSupportedYear } from './dates.ts';

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'] as const;
const CHI = [
  'Tý',
  'Sửu',
  'Dần',
  'Mão',
  'Thìn',
  'Tỵ',
  'Ngọ',
  'Mùi',
  'Thân',
  'Dậu',
  'Tuất',
  'Hợi',
] as const;

/** The sexagenary (Can Chi) name of a lunar year: 1924 → "Giáp Tý". */
export function canChiYear(lunarYear: number): string {
  assertSupportedYear(lunarYear);
  return `${CAN[(lunarYear + 6) % 10]!} ${CHI[(lunarYear + 8) % 12]!}`;
}
