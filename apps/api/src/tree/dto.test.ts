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
          },
        },
        upsert: true,
      },
    });
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
