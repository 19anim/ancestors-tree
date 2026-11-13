import { describe, expect, it } from 'vitest';
import {
  DateInfoSchema,
  DeathSchema,
  PersonChangesSchema,
  PersonSchema,
  UnionChangesSchema,
  UnionSchema,
} from './schemas.ts';
import { EMPTY_TREE, treeStateFromLists } from './state.ts';

const ID = '64b7f0c2a1b2c3d4e5f60718';
const OTHER = '64b7f0c2a1b2c3d4e5f60719';

const person = {
  id: ID,
  fullName: 'Nguyễn Văn Tư',
  aliases: [],
  gender: 'male',
  death: { isDeceased: false },
  isAdopted: false,
};

describe('DateInfoSchema', () => {
  it('needs the side the user entered', () => {
    expect(
      DateInfoSchema.safeParse({ source: 'solar', solar: { day: 12, month: 5, year: 1931 } })
        .success,
    ).toBe(true);
    expect(
      DateInfoSchema.safeParse({
        source: 'lunar',
        lunar: { day: 15, month: 10, year: 1931, isLeap: false },
      }).success,
    ).toBe(true);
    expect(DateInfoSchema.safeParse({ source: 'approx', approxYear: 1920 }).success).toBe(true);
    expect(DateInfoSchema.safeParse({ source: 'solar', approxYear: 1920 }).success).toBe(false);
    expect(DateInfoSchema.safeParse({ source: 'approx', approxYear: 999 }).success).toBe(false);
  });

  it('reuses the lunar library date checks', () => {
    expect(
      DateInfoSchema.safeParse({ source: 'solar', solar: { day: 30, month: 2, year: 1931 } })
        .success,
    ).toBe(false);
  });
});

describe('DeathSchema', () => {
  it('allows a date of death only for a deceased person', () => {
    const date = { source: 'approx', approxYear: 1990 };
    expect(DeathSchema.safeParse({ isDeceased: true, date }).success).toBe(true);
    expect(DeathSchema.safeParse({ isDeceased: false, date }).success).toBe(false);
  });
});

describe('PersonSchema', () => {
  it('accepts a minimal person and trims the name', () => {
    expect(PersonSchema.parse({ ...person, fullName: '  Nguyễn Văn Tư ' })).toEqual(person);
  });

  it('rejects a malformed id, an empty name and an unknown gender', () => {
    expect(PersonSchema.safeParse({ ...person, id: 'abc' }).success).toBe(false);
    expect(PersonSchema.safeParse({ ...person, fullName: '  ' }).success).toBe(false);
    expect(PersonSchema.safeParse({ ...person, gender: 'other' }).success).toBe(false);
  });
});

describe('PersonChangesSchema', () => {
  it('takes changed fields only, and null clears an optional field', () => {
    expect(PersonChangesSchema.parse({ fullName: 'Tư', bio: null })).toEqual({
      fullName: 'Tư',
      bio: null,
    });
    expect(PersonChangesSchema.safeParse({}).success).toBe(false);
  });

  it('refuses fields that other ops own', () => {
    expect(PersonChangesSchema.safeParse({ id: OTHER }).success).toBe(false);
    expect(PersonChangesSchema.safeParse({ parentUnionId: OTHER }).success).toBe(false);
    expect(PersonChangesSchema.safeParse({ fullName: null }).success).toBe(false);
  });
});

describe('UnionSchema', () => {
  it('has one or two different partners', () => {
    const union = { id: OTHER, partnerIds: [ID], order: 1, status: 'married' };
    expect(UnionSchema.safeParse(union).success).toBe(true);
    expect(UnionSchema.safeParse({ ...union, partnerIds: [] }).success).toBe(false);
    expect(UnionSchema.safeParse({ ...union, partnerIds: [ID, ID] }).success).toBe(false);
    expect(UnionSchema.safeParse({ ...union, partnerIds: [ID, OTHER, OTHER] }).success).toBe(false);
  });

  it('changes need at least one field', () => {
    expect(UnionChangesSchema.safeParse({ status: 'divorced' }).success).toBe(true);
    expect(UnionChangesSchema.safeParse({}).success).toBe(false);
  });
});

describe('treeStateFromLists', () => {
  it('keys people and unions by id', () => {
    const union = { id: OTHER, partnerIds: [ID], order: 1, status: 'married' as const };
    const tree = treeStateFromLists(ID, [PersonSchema.parse(person)], [union]);
    expect(tree.progenitorId).toBe(ID);
    expect(tree.persons[ID]?.fullName).toBe('Nguyễn Văn Tư');
    expect(tree.unions[OTHER]).toEqual(union);
    expect(EMPTY_TREE).toEqual({ progenitorId: null, persons: {}, unions: {} });
  });
});
