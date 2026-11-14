import { z } from 'zod';
import { IdSchema } from '../api/common.ts';
import { LunarDateSchema, MAX_YEAR, MIN_YEAR, SolarDateSchema } from '../lunar/dates.ts';

/** The design limit of one family tree (spec §5). */
export const MAX_PERSONS = 5000;

export const GenderSchema = z.enum(['male', 'female']);
// No custom messages: the web translates Zod issues by code (formErrors.ts).
export const FullNameSchema = z.string().trim().min(1).max(120);
const ShortTextSchema = z.string().trim().max(120);
const AliasesSchema = z.array(z.string().trim().min(1).max(120)).max(10);
const SiblingOrderSchema = z.number().int().min(1).max(99);
const BioSchema = z.string().trim().max(5000);
const BurialPlaceSchema = z.string().trim().max(200);

/**
 * A birth or death date (spec §5). The lunar library's schemas are nested, not extended: Zod 4
 * cannot extend a refined object schema.
 */
export const DateInfoSchema = z
  .object({
    solar: SolarDateSchema.optional(),
    lunar: LunarDateSchema.optional(),
    approxYear: z.number().int().min(MIN_YEAR).max(MAX_YEAR).optional(),
    /** What the user actually entered; kept as the ground truth. */
    source: z.enum(['solar', 'lunar', 'approx']),
  })
  .refine(
    (date) =>
      (date.source === 'solar'
        ? date.solar
        : date.source === 'lunar'
          ? date.lunar
          : date.approxYear) !== undefined,
    { message: 'The side the user entered must be present', path: ['source'] },
  );

export const DeathSchema = z
  .object({ isDeceased: z.boolean(), date: DateInfoSchema.optional() })
  .refine((death) => death.isDeceased || death.date === undefined, {
    message: 'Only a deceased person has a date of death',
    path: ['date'],
  });

/** Only meaningful for in-laws (spec §8). */
export const BirthFamilySchema = z.object({
  surname: ShortTextSchema.optional(),
  fatherName: ShortTextSchema.optional(),
  motherName: ShortTextSchema.optional(),
  hometown: ShortTextSchema.optional(),
  note: z.string().trim().max(1000).optional(),
});

/**
 * A person in the genealogy (spec §5). `clanId`, `createdAt` and `updatedAt` stay on the
 * server. `treeLink` (P10), `photo` (P6) and `cardStyle` (P6b) arrive with their features.
 */
export const PersonSchema = z.object({
  id: IdSchema,
  fullName: FullNameSchema,
  aliases: AliasesSchema,
  gender: GenderSchema,
  birth: DateInfoSchema.optional(),
  death: DeathSchema,
  /** The marriage this person was born into; changed only by `setParents`. */
  parentUnionId: IdSchema.optional(),
  isAdopted: z.boolean(),
  siblingOrder: SiblingOrderSchema.optional(),
  branch: ShortTextSchema.optional(),
  birthFamily: BirthFamilySchema.optional(),
  bio: BioSchema.optional(),
  burialPlace: BurialPlaceSchema.optional(),
});

/** Optional Person fields that `updatePerson` may clear by sending `null`. */
export const CLEARABLE_PERSON_FIELDS = [
  'birth',
  'siblingOrder',
  'branch',
  'birthFamily',
  'bio',
  'burialPlace',
] as const;

/** Changed fields only (spec §6.1). `id` and `parentUnionId` belong to other ops. */
export const PersonChangesSchema = z
  .strictObject({
    fullName: FullNameSchema.optional(),
    aliases: AliasesSchema.optional(),
    gender: GenderSchema.optional(),
    birth: DateInfoSchema.nullable().optional(),
    death: DeathSchema.optional(),
    isAdopted: z.boolean().optional(),
    siblingOrder: SiblingOrderSchema.nullable().optional(),
    branch: ShortTextSchema.nullable().optional(),
    birthFamily: BirthFamilySchema.nullable().optional(),
    bio: BioSchema.nullable().optional(),
    burialPlace: BurialPlaceSchema.nullable().optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'Send at least one field to change',
  });

export const UnionStatusSchema = z.enum(['married', 'divorced', 'widowed']);

const PartnerIdsSchema = z
  .array(IdSchema)
  .min(1)
  .max(2)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: 'Partners must be different people',
  });
const UnionOrderSchema = z.number().int().min(1).max(99);

/** One marriage (spec §5); one partner when only one parent is known. */
export const UnionSchema = z.object({
  id: IdSchema,
  partnerIds: PartnerIdsSchema,
  /** 1 = first spouse, 2 = second… */
  order: UnionOrderSchema,
  status: UnionStatusSchema,
});

export const UnionChangesSchema = z
  .strictObject({
    partnerIds: PartnerIdsSchema.optional(),
    order: UnionOrderSchema.optional(),
    status: UnionStatusSchema.optional(),
  })
  .refine((changes) => Object.values(changes).some((value) => value !== undefined), {
    message: 'Send at least one field to change',
  });

export type Gender = z.infer<typeof GenderSchema>;
export type DateInfo = z.infer<typeof DateInfoSchema>;
export type Death = z.infer<typeof DeathSchema>;
export type BirthFamily = z.infer<typeof BirthFamilySchema>;
export type Person = z.infer<typeof PersonSchema>;
export type PersonChanges = z.infer<typeof PersonChangesSchema>;
export type UnionStatus = z.infer<typeof UnionStatusSchema>;
export type Union = z.infer<typeof UnionSchema>;
export type UnionChanges = z.infer<typeof UnionChangesSchema>;
