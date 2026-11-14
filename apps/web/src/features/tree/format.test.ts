import { OpError } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { ApiError } from '../../shared/lib/apiError';
import { fixturePerson } from './fixtures';
import {
  birthdayOf,
  birthFamilySubtitle,
  cardLabel,
  dayMonth,
  deathAnniversaryOf,
  lifeYears,
  lifeYearsSpoken,
  rejectionMessage,
  yearOf,
} from './format';

const ID = '64b7f0c2a1b2c3d4e5f6a0aa';

describe('life years', () => {
  it('uses the side of a date the user entered', () => {
    expect(yearOf({ source: 'solar', solar: { day: 1, month: 2, year: 1931 } })).toBe('1931');
    expect(
      yearOf({ source: 'lunar', lunar: { day: 15, month: 10, year: 1930, isLeap: false } }),
    ).toBe('1930');
    expect(yearOf({ source: 'approx', approxYear: 1900 })).toBe('~1900');
    expect(yearOf(undefined)).toBeUndefined();
  });

  it('shows birth and death years when known', () => {
    const born = { source: 'approx', approxYear: 1931 } as const;
    const died = { source: 'approx', approxYear: 2004 } as const;
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born }))).toBe('~1931');
    expect(
      lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true, date: died } })),
    ).toBe('~1931–~2004');
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true } }))).toBe(
      '~1931–?',
    );
    expect(lifeYears(fixturePerson(ID, 'A', { death: { isDeceased: true, date: died } }))).toBe(
      '?–~2004',
    );
    expect(lifeYears(fixturePerson(ID, 'A'))).toBeUndefined();
  });
});

describe('rejectionMessage', () => {
  it('names the rule an OpError or a RULE_VIOLATION broke, else the error', () => {
    expect(rejectionMessage(i18n.t, new OpError('PERSON_HAS_CHILDREN'))).toBe(
      'Không xoá được người còn con. Hãy gỡ hoặc chuyển các con trước.',
    );
    const refused = new ApiError('RULE_VIOLATION', 'No', 422, undefined, 'CYCLE');
    expect(rejectionMessage(i18n.t, refused)).toBe(
      'Thay đổi này sẽ khiến một người thành tổ tiên của chính mình.',
    );
    expect(rejectionMessage(i18n.t, new ApiError('VERSION_CONFLICT', 'x', 409))).toBe(
      'Cây gia phả vừa được người khác cập nhật.',
    );
  });
});

describe('date marks', () => {
  const lunarDeath = {
    source: 'lunar',
    lunar: { day: 15, month: 10, year: 1990, isLeap: false },
  } as const;
  const solarDeath = { source: 'solar', solar: { day: 17, month: 2, year: 2026 } } as const;

  it('gives the lunar death day for the anniversary, entered or derived', () => {
    expect(
      deathAnniversaryOf(fixturePerson(ID, 'A', { death: { isDeceased: true, date: lunarDeath } })),
    ).toEqual({ day: 15, month: 10 });
    // 17 February 2026 is Tết: lunar 1/1.
    expect(
      deathAnniversaryOf(fixturePerson(ID, 'A', { death: { isDeceased: true, date: solarDeath } })),
    ).toEqual({ day: 1, month: 1 });
    expect(
      deathAnniversaryOf(
        fixturePerson(ID, 'A', {
          death: { isDeceased: true, date: { source: 'approx', approxYear: 1990 } },
        }),
      ),
    ).toBeUndefined();
    expect(deathAnniversaryOf(fixturePerson(ID, 'A'))).toBeUndefined();
  });

  it('gives a birthday only to the living with a known solar day', () => {
    const born = {
      source: 'lunar',
      lunar: { day: 1, month: 1, year: 2026, isLeap: false },
    } as const;
    expect(birthdayOf(fixturePerson(ID, 'A', { birth: born }))).toEqual({ day: 17, month: 2 });
    expect(
      birthdayOf(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true } })),
    ).toBeUndefined();
    expect(
      birthdayOf(fixturePerson(ID, 'A', { birth: { source: 'approx', approxYear: 1990 } })),
    ).toBeUndefined();
    expect(dayMonth({ day: 5, month: 9 })).toBe('5/9');
  });

  it('reads an approximate year as words', () => {
    const born = { source: 'approx', approxYear: 1931 } as const;
    expect(lifeYearsSpoken(i18n.t, fixturePerson(ID, 'A', { birth: born }))).toBe(
      'khoảng năm 1931',
    );
    expect(
      lifeYearsSpoken(
        i18n.t,
        fixturePerson(ID, 'A', {
          birth: { source: 'solar', solar: { day: 1, month: 2, year: 1931 } },
          death: { isDeceased: true },
        }),
      ),
    ).toBe('1931–?');
  });
});

describe('in-law subtitle and card label', () => {
  it('names the father first, then the mother, then the surname, with the hometown', () => {
    const wife = fixturePerson(ID, 'Lê Thị Hoa', {
      gender: 'female',
      birthFamily: { fatherName: 'Lê Văn Ba', hometown: 'Hà Nam' },
    });
    expect(birthFamilySubtitle(i18n.t, wife)).toBe('Con gái ông Lê Văn Ba · Hà Nam');
    expect(
      birthFamilySubtitle(
        i18n.t,
        fixturePerson(ID, 'A', { birthFamily: { motherName: 'Đỗ Thị Tư' } }),
      ),
    ).toBe('Con trai bà Đỗ Thị Tư');
    expect(
      birthFamilySubtitle(i18n.t, fixturePerson(ID, 'A', { birthFamily: { surname: 'Trần' } })),
    ).toBe('Họ Trần');
    expect(birthFamilySubtitle(i18n.t, fixturePerson(ID, 'A'))).toBeUndefined();
  });

  it('adds the subtitle to an in-law card only', () => {
    const wife = fixturePerson(ID, 'Lê Thị Hoa', {
      gender: 'female',
      birthFamily: { fatherName: 'Lê Văn Ba' },
    });
    expect(cardLabel(i18n.t, wife, 2, true)).toBe('Lê Thị Hoa, đời thứ 2, Con gái ông Lê Văn Ba');
    expect(cardLabel(i18n.t, wife, 2, false)).toBe('Lê Thị Hoa, đời thứ 2');
  });
});
