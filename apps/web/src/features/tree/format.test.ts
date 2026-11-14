import { OpError } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import i18n from '../../shared/i18n';
import { ApiError } from '../../shared/lib/apiError';
import { fixturePerson } from './fixtures';
import { lifeYears, rejectionMessage, yearOf } from './format';

const ID = '64b7f0c2a1b2c3d4e5f6a0aa';

describe('life years', () => {
  it('uses the side of a date the user entered', () => {
    expect(yearOf({ source: 'solar', solar: { day: 1, month: 2, year: 1931 } })).toBe('1931');
    expect(
      yearOf({ source: 'lunar', lunar: { day: 15, month: 10, year: 1930, isLeap: false } }),
    ).toBe('1930');
    expect(yearOf({ source: 'approx', approxYear: 1900 })).toBe('1900');
    expect(yearOf(undefined)).toBeUndefined();
  });

  it('shows birth and death years when known', () => {
    const born = { source: 'approx', approxYear: 1931 } as const;
    const died = { source: 'approx', approxYear: 2004 } as const;
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born }))).toBe('1931');
    expect(
      lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true, date: died } })),
    ).toBe('1931–2004');
    expect(lifeYears(fixturePerson(ID, 'A', { birth: born, death: { isDeceased: true } }))).toBe(
      '1931–?',
    );
    expect(lifeYears(fixturePerson(ID, 'A', { death: { isDeceased: true, date: died } }))).toBe(
      '?–2004',
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
