import { newObjectId, type Person, type Union } from '@ancestors-tree/shared/tree';
import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { personWrite, toPerson, toUnion, unionWrite } from './dto.ts';

const clanId = new Types.ObjectId();

describe('tree DTOs', () => {
  it('maps a stored person to the shared shape and drops empty optional fields', () => {
    const id = new Types.ObjectId();
    const parent = new Types.ObjectId();
    const person = toPerson({
      _id: id,
      fullName: 'Nguyễn Văn Tư',
      aliases: ['Cụ Tư'],
      gender: 'male',
      death: { isDeceased: true, date: { source: 'approx', approxYear: 1990 } },
      parentUnionId: parent,
      isAdopted: false,
      branch: 'Chi trưởng',
      bio: null,
    });
    expect(person).toEqual({
      id: id.toString(),
      fullName: 'Nguyễn Văn Tư',
      aliases: ['Cụ Tư'],
      gender: 'male',
      death: { isDeceased: true, date: { source: 'approx', approxYear: 1990 } },
      parentUnionId: parent.toString(),
      isAdopted: false,
      branch: 'Chi trưởng',
    });
  });

  it('maps a stored union', () => {
    const [id, a, b] = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    expect(toUnion({ _id: id, partnerIds: [a, b], order: 2, status: 'divorced' })).toEqual({
      id: id.toString(),
      partnerIds: [a.toString(), b.toString()],
      order: 2,
      status: 'divorced',
    });
  });

  it('writes a person with an upsert that sets present fields and unsets missing ones', () => {
    const person: Person = {
      id: newObjectId(),
      fullName: 'Lê Thị Hoa',
      aliases: [],
      gender: 'female',
      death: { isDeceased: false },
      isAdopted: false,
      bio: 'Con gái thứ hai',
    };
    const write = personWrite(clanId, person);
    expect(write).toEqual({
      updateOne: {
        filter: { _id: new Types.ObjectId(person.id), clanId },
        update: {
          $set: {
            fullName: 'Lê Thị Hoa',
            aliases: [],
            gender: 'female',
            death: { isDeceased: false },
            isAdopted: false,
            bio: 'Con gái thứ hai',
          },
          $unset: {
            parentUnionId: '',
            birth: '',
            siblingOrder: '',
            branch: '',
            birthFamily: '',
            burialPlace: '',
            photo: '',
            cardStyle: '',
          },
        },
        upsert: true,
      },
    });
  });

  it('reads a stored photo back and unsets it when the person has none', () => {
    const id = new Types.ObjectId();
    const photo = { publicId: 'ancestors-tree/dev/clans/a/people/b/0123456789abcdef', version: 3 };
    const person = toPerson({
      _id: id,
      fullName: 'Nguyễn Văn Tư',
      gender: 'male',
      death: { isDeceased: false },
      isAdopted: false,
      photo,
    });
    expect(person.photo).toEqual(photo);
    const { photo: _removed, ...withoutPhoto } = person;
    const { update } = (
      personWrite(clanId, withoutPhoto) as {
        updateOne: { update: { $set: Record<string, unknown>; $unset: Record<string, ''> } };
      }
    ).updateOne;
    expect(update.$unset.photo).toBe('');
    expect(update.$set).not.toHaveProperty('photo');
  });

  it("round-trips a card's own style, and unsets it once cleared", () => {
    const stored = {
      _id: new Types.ObjectId(),
      fullName: 'Nguyễn Văn Tư',
      gender: 'male' as const,
      death: { isDeceased: false },
      isAdopted: false,
    };
    const cardStyle = { frame: 'vintage', fastener: 'magnet' } as const;
    const person = toPerson({ ...stored, cardStyle });
    expect(person.cardStyle).toEqual(cardStyle);
    expect(toPerson({ ...stored, cardStyle: null })).not.toHaveProperty('cardStyle');

    type Update = { $set: Record<string, unknown>; $unset?: Record<string, ''> };
    const updateOf = (written: Person) =>
      (personWrite(clanId, written) as { updateOne: { update: Update } }).updateOne.update;
    expect(updateOf(person).$set.cardStyle).toEqual(cardStyle);
    expect(updateOf(person).$unset).not.toHaveProperty('cardStyle');
    const { cardStyle: _cleared, ...withoutStyle } = person;
    expect(updateOf(withoutStyle).$unset?.cardStyle).toBe('');
    expect(updateOf(withoutStyle).$set).not.toHaveProperty('cardStyle');
  });

  it('writes a union with ObjectId partners', () => {
    const union: Union = {
      id: newObjectId(),
      partnerIds: [newObjectId()],
      order: 1,
      status: 'married',
    };
    expect(unionWrite(clanId, union)).toEqual({
      updateOne: {
        filter: { _id: new Types.ObjectId(union.id), clanId },
        update: {
          $set: {
            partnerIds: [new Types.ObjectId(union.partnerIds[0])],
            order: 1,
            status: 'married',
          },
        },
        upsert: true,
      },
    });
  });
});
