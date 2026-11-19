import { describe, expect, it } from 'vitest';
import { newObjectId } from './ids.ts';
import { photosInOp } from './photos.ts';
import { PersonChangesSchema, PersonSchema, MAX_PHOTO_BYTES } from './schemas.ts';
import type { Op, Person } from './index.ts';

const PHOTO = { publicId: 'ancestors-tree/dev/clans/a/people/b/0123456789abcdef', version: 3 };

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: newObjectId(),
    fullName: 'Nguyễn Văn Tư',
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
    ...overrides,
  };
}

describe('Person.photo', () => {
  it('accepts a photo and clears it with null in changes', () => {
    expect(PersonSchema.parse(person({ photo: PHOTO })).photo).toEqual(PHOTO);
    expect(PersonChangesSchema.parse({ photo: null })).toEqual({ photo: null });
  });

  it('refuses a public id with characters outside the path alphabet, and a bad version', () => {
    expect(PersonChangesSchema.safeParse({ photo: { ...PHOTO, publicId: '../x' } }).success).toBe(
      false,
    );
    expect(PersonChangesSchema.safeParse({ photo: { ...PHOTO, publicId: 'a b' } }).success).toBe(
      false,
    );
    expect(PersonChangesSchema.safeParse({ photo: { ...PHOTO, version: 0 } }).success).toBe(false);
  });

  it('is 2 MB at most', () => {
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('photosInOp', () => {
  it('finds photos in addPerson, updatePerson, restorePerson and inside a batch', () => {
    const a = person({ photo: PHOTO });
    const b = person();
    const op: Op = {
      type: 'batch',
      payload: {
        ops: [
          { type: 'addPerson', payload: a },
          { type: 'updatePerson', payload: { id: b.id, changes: { photo: PHOTO } } },
          { type: 'restorePerson', payload: { person: { ...b, photo: PHOTO }, unions: [] } },
        ],
      },
    };
    expect(photosInOp(op)).toEqual([
      { personId: a.id, photo: PHOTO },
      { personId: b.id, photo: PHOTO },
      { personId: b.id, photo: PHOTO },
    ]);
  });

  it('ignores a removed photo and ops without photos', () => {
    const b = person();
    expect(
      photosInOp({ type: 'updatePerson', payload: { id: b.id, changes: { photo: null } } }),
    ).toEqual([]);
    expect(photosInOp({ type: 'addPerson', payload: b })).toEqual([]);
    expect(photosInOp({ type: 'deletePerson', payload: { id: b.id } })).toEqual([]);
  });
});
