import {
  BirthFamilySchema,
  PersonSchema,
  type BirthFamily,
  type DateInfo,
  type Person,
  type PersonChanges,
} from '@ancestors-tree/shared/tree';
import { z } from 'zod';
import {
  draftFromDateInfo,
  draftToDateInfo,
  EMPTY_DATE_DRAFT,
  type DateDraft,
} from '../../shared/ui';

export const DateDraftSchema: z.ZodType<DateDraft, DateDraft> = z.object({
  mode: z.enum(['solar', 'lunar', 'approx']),
  day: z.string(),
  month: z.string(),
  year: z.string(),
  isLeap: z.boolean(),
});

/** A DateDraft parsed into a DateInfo (null when empty), or an issue at the field. */
const DateFieldSchema = DateDraftSchema.transform((draft, ctx): DateInfo | null => {
  const result = draftToDateInfo(draft);
  if (result.ok) return result.value;
  ctx.addIssue({ code: 'custom', params: { messageKey: `dates.errors.${result.error}` } });
  return z.NEVER;
});

/** Trimmed text, null when empty, then the shared field's own rule. */
function optionalText(schema: z.ZodType<string, string>) {
  return z
    .string()
    .trim()
    .transform((text) => (text === '' ? null : text))
    .pipe(schema.nullable());
}

const ShortText = BirthFamilySchema.shape.surname.unwrap();

const SiblingOrderField = z
  .string()
  .trim()
  .transform((text, ctx): number | null => {
    if (text === '') return null;
    const order = Number(text);
    if (!/^\d+$/.test(text) || order < 1 || order > 99) {
      ctx.addIssue({ code: 'custom', params: { messageKey: 'tree.profile.siblingOrderError' } });
      return z.NEVER;
    }
    return order;
  });

const BirthFamilyField = z
  .object({
    surname: optionalText(ShortText),
    fatherName: optionalText(ShortText),
    motherName: optionalText(ShortText),
    hometown: optionalText(ShortText),
    note: optionalText(BirthFamilySchema.shape.note.unwrap()),
  })
  .transform((family): BirthFamily | null => {
    const kept = Object.fromEntries(
      Object.entries(family).filter(([, value]) => value !== null),
    ) as BirthFamily;
    return Object.keys(kept).length === 0 ? null : kept;
  });

/** The checked fields: hidden ones are already set aside by ProfileFormSchema. */
const ProfileFieldsSchema = z
  .object({
    fullName: PersonSchema.shape.fullName,
    aliases: z
      .string()
      .transform((text) =>
        text
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line !== ''),
      )
      .pipe(PersonSchema.shape.aliases),
    gender: PersonSchema.shape.gender,
    status: z.enum(['living', 'deceased']),
    birth: DateFieldSchema,
    death: DateFieldSchema,
    isAdopted: z.boolean(),
    siblingOrder: SiblingOrderField,
    branch: optionalText(PersonSchema.shape.branch.unwrap()),
    burialPlace: optionalText(PersonSchema.shape.burialPlace.unwrap()),
    bio: optionalText(PersonSchema.shape.bio.unwrap()),
    birthFamily: BirthFamilyField,
  })
  .transform(({ status, death, burialPlace, ...rest }) => ({
    ...rest,
    // Only the deceased have a burial place and a date of death to send.
    ...(status === 'deceased' ? { burialPlace } : {}),
    death:
      status === 'living'
        ? { isDeceased: false }
        : death === null
          ? { isDeceased: true }
          : { isDeceased: true, date: death },
  }));

/** What the fields hold: strings, drafts and booleans, before any rule is checked. */
const ProfileInputSchema = z.object({
  fullName: z.string(),
  aliases: z.string(),
  gender: PersonSchema.shape.gender,
  status: z.enum(['living', 'deceased']),
  birth: DateDraftSchema,
  death: DateDraftSchema,
  isAdopted: z.boolean(),
  siblingOrder: z.string(),
  branch: z.string(),
  burialPlace: z.string(),
  bio: z.string(),
  birthFamily: z.object({
    surname: z.string(),
    fatherName: z.string(),
    motherName: z.string(),
    hometown: z.string(),
    note: z.string(),
  }),
});

/**
 * The profile form (spec §7.6): what the fields hold in, the values ops are built from out.
 * While "living" is picked the death fields are hidden but keep what was typed (switching back
 * loses nothing): they are neither checked, so a half-typed date cannot block Save unseen, nor
 * sent.
 */
export const ProfileFormSchema = ProfileInputSchema.transform((values) =>
  values.status === 'living' ? { ...values, death: EMPTY_DATE_DRAFT, burialPlace: '' } : values,
).pipe(ProfileFieldsSchema);

export type ProfileFormValues = z.input<typeof ProfileFormSchema>;
export type ProfileValues = z.output<typeof ProfileFormSchema>;

export function formValuesFromPerson(person: Person): ProfileFormValues {
  const family = person.birthFamily ?? {};
  return {
    fullName: person.fullName,
    aliases: person.aliases.join('\n'),
    gender: person.gender,
    status: person.death.isDeceased ? 'deceased' : 'living',
    birth: draftFromDateInfo(person.birth),
    death: person.death.isDeceased ? draftFromDateInfo(person.death.date) : EMPTY_DATE_DRAFT,
    isAdopted: person.isAdopted,
    siblingOrder: person.siblingOrder?.toString() ?? '',
    branch: person.branch ?? '',
    burialPlace: person.burialPlace ?? '',
    bio: person.bio ?? '',
    birthFamily: {
      surname: family.surname ?? '',
      fatherName: family.fatherName ?? '',
      motherName: family.motherName ?? '',
      hometown: family.hometown ?? '',
      note: family.note ?? '',
    },
  };
}

/** Both sides come out of ProfileFormSchema, so equal values serialise alike. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The fields that differ from the values the form opened with (spec §7.6), ready for
 * `updatePerson`; null when nothing changed. Without a base (stored values the form cannot
 * parse), every field is sent.
 */
export function personChanges(
  base: ProfileValues | null,
  next: ProfileValues,
): PersonChanges | null {
  const changes: Partial<Record<keyof ProfileValues, unknown>> = {};
  for (const key of Object.keys(next) as (keyof ProfileValues)[]) {
    // A field one side leaves out (the burial place of the living) counts as empty.
    if (base !== null && same(base[key] ?? null, next[key] ?? null)) continue;
    changes[key] = next[key];
  }
  return Object.keys(changes).length === 0 ? null : (changes as PersonChanges);
}
