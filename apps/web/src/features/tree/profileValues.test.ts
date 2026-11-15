import { describe, expect, it } from 'vitest';
import { fixturePerson } from './fixtures';
import {
  formValuesFromPerson,
  personChanges,
  ProfileFormSchema,
  type ProfileFormValues,
} from './profileValues';

const ID = '64b7f0c2a1b2c3d4e5f6c001';
const person = fixturePerson(ID, 'Nguyễn Văn Nam', {
  aliases: ['Cu Tí'],
  branch: 'Chi hai',
  birth: { source: 'solar', solar: { day: 17, month: 2, year: 2026 } },
});

function parse(values: ProfileFormValues) {
  return ProfileFormSchema.parse(values);
}

describe('personChanges', () => {
  const base = parse(formValuesFromPerson(person));

  it('sends nothing when nothing changed, even though the stored date lacks its lunar side', () => {
    expect(personChanges(base, parse(formValuesFromPerson(person)))).toBeNull();
  });

  it('sends only the changed fields, trimmed, with emptied ones as null', () => {
    const values = formValuesFromPerson(person);
    const next = parse({
      ...values,
      fullName: '  Nguyễn Văn Năm ',
      branch: '   ',
      aliases: 'Cu Tí\n\n Tí ',
    });
    expect(personChanges(base, next)).toEqual({
      fullName: 'Nguyễn Văn Năm',
      branch: null,
      aliases: ['Cu Tí', 'Tí'],
    });
  });

  it('sends a death date with both calendars, and drops it for the living', () => {
    const values = formValuesFromPerson(person);
    const died = parse({
      ...values,
      status: 'deceased',
      death: { mode: 'lunar', day: '1', month: '1', year: '2026', isLeap: false },
    });
    expect(personChanges(base, died)).toEqual({
      death: {
        isDeceased: true,
        date: {
          source: 'lunar',
          lunar: { day: 1, month: 1, year: 2026, isLeap: false },
          solar: { day: 17, month: 2, year: 2026 },
        },
      },
    });
    const living = parse({
      ...values,
      death: { mode: 'solar', day: '1', month: '1', year: '2000', isLeap: false },
    });
    expect(personChanges(base, living)).toBeNull();
  });

  it('clears the birth date and the sibling order with null', () => {
    const values = formValuesFromPerson({ ...person, siblingOrder: 2 });
    const start = parse(values);
    const next = parse({
      ...values,
      birth: { mode: 'solar', day: '', month: '', year: '', isLeap: false },
      siblingOrder: '',
    });
    expect(personChanges(start, next)).toEqual({ birth: null, siblingOrder: null });
  });

  it('keeps the birth family together, null when emptied', () => {
    const inLaw = { ...person, birthFamily: { fatherName: 'Lê Văn Ba' } };
    const values = formValuesFromPerson(inLaw);
    const start = parse(values);
    expect(
      personChanges(
        start,
        parse({ ...values, birthFamily: { ...values.birthFamily, hometown: 'Hà Nam' } }),
      ),
    ).toEqual({ birthFamily: { fatherName: 'Lê Văn Ba', hometown: 'Hà Nam' } });
    expect(
      personChanges(
        start,
        parse({ ...values, birthFamily: { ...values.birthFamily, fatherName: '' } }),
      ),
    ).toEqual({ birthFamily: null });
  });

  it('refuses a date or sibling order it cannot store', () => {
    const values = formValuesFromPerson(person);
    const bad = ProfileFormSchema.safeParse({
      ...values,
      birth: { mode: 'lunar', day: '', month: '', year: '1950', isLeap: false },
      siblingOrder: '100',
    });
    expect(bad.success).toBe(false);
    const paths = bad.error?.issues.map((issue) => issue.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['birth', 'siblingOrder']));
  });
});
