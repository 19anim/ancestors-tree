import { CLEARABLE_PERSON_FIELDS, type Person, type Union } from '@ancestors-tree/shared/tree';
import { Types, type AnyBulkWriteOperation } from 'mongoose';

/** A Person document as `.lean()` returns it. */
export interface PersonRecord {
  _id: Types.ObjectId;
  fullName: string;
  aliases?: string[];
  gender: Person['gender'];
  birth?: Person['birth'] | null;
  death: Person['death'];
  parentUnionId?: Types.ObjectId | null;
  isAdopted: boolean;
  siblingOrder?: number | null;
  branch?: string | null;
  birthFamily?: Person['birthFamily'] | null;
  bio?: string | null;
  burialPlace?: string | null;
}

/** A Union document as `.lean()` returns it. */
export interface UnionRecord {
  _id: Types.ObjectId;
  partnerIds: Types.ObjectId[];
  order: number;
  status: Union['status'];
}

export type TreeWrite = AnyBulkWriteOperation<Record<string, unknown>>;

/** Optional fields are left out, never sent as null (the shared schemas use `.optional()`). */
export function toPerson(record: PersonRecord): Person {
  const person: Person = {
    id: record._id.toString(),
    fullName: record.fullName,
    aliases: record.aliases ?? [],
    gender: record.gender,
    death: record.death,
    isAdopted: record.isAdopted,
  };
  if (record.parentUnionId) person.parentUnionId = record.parentUnionId.toString();
  const optional = person as Record<string, unknown>;
  for (const field of CLEARABLE_PERSON_FIELDS) {
    const value = record[field];
    if (value !== undefined && value !== null) optional[field] = value;
  }
  return person;
}

export function toUnion(record: UnionRecord): Union {
  return {
    id: record._id.toString(),
    partnerIds: record.partnerIds.map((id) => id.toString()),
    order: record.order,
    status: record.status,
  };
}

/**
 * Insert or replace one person in this clan. Fields the person no longer has are unset. The
 * filter includes clanId, so an id used by another clan fails with a duplicate key (E11000).
 */
export function personWrite(clanId: Types.ObjectId, person: Person): TreeWrite {
  const { id, parentUnionId, ...fields } = person;
  const set: Record<string, unknown> = { ...fields };
  const unset: Record<string, ''> = {};
  if (parentUnionId === undefined) unset.parentUnionId = '';
  else set.parentUnionId = new Types.ObjectId(parentUnionId);
  for (const field of CLEARABLE_PERSON_FIELDS) {
    if (person[field] === undefined) unset[field] = '';
  }
  return {
    updateOne: {
      filter: { _id: new Types.ObjectId(id), clanId },
      update: { $set: set, ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}) },
      upsert: true,
    },
  };
}

export function unionWrite(clanId: Types.ObjectId, union: Union): TreeWrite {
  return {
    updateOne: {
      filter: { _id: new Types.ObjectId(union.id), clanId },
      update: {
        $set: {
          partnerIds: union.partnerIds.map((id) => new Types.ObjectId(id)),
          order: union.order,
          status: union.status,
        },
      },
      upsert: true,
    },
  };
}
