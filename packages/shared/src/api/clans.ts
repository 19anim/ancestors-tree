import { z } from 'zod';
import { IdSchema } from './common.ts';

export const ClanRoleSchema = z.enum(['owner', 'editor', 'viewer']);
/** Roles an invite or a role change can grant; there is exactly one owner. */
export const InviteRoleSchema = z.enum(['editor', 'viewer']);

const ROLE_RANK = { viewer: 1, editor: 2, owner: 3 } as const;

export function hasRoleAtLeast(role: ClanRole, minimum: ClanRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

// No custom messages on form fields (see auth.ts).
const ClanNameSchema = z.string().trim().min(1).max(120);
const HometownSchema = z.string().trim().max(120);
const DescriptionSchema = z.string().trim().max(2000);
const DateTimeSchema = z.iso.datetime();

export const CreateClanRequestSchema = z.object({
  name: ClanNameSchema,
  hometown: HometownSchema.default(''),
  description: DescriptionSchema.default(''),
});

export const UpdateClanRequestSchema = z
  .object({
    name: ClanNameSchema.optional(),
    hometown: HometownSchema.optional(),
    description: DescriptionSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Send at least one field to change',
  });

export const ClanSchema = z.object({
  id: IdSchema,
  name: z.string(),
  hometown: z.string(),
  description: z.string(),
  /** The caller's role in this clan. */
  role: ClanRoleSchema,
  memberCount: z.number().int().min(1),
  createdAt: DateTimeSchema,
});
export const ClanListSchema = z.array(ClanSchema);

export const MemberSchema = z.object({
  userId: IdSchema,
  name: z.string(),
  /** Only for the clan owner, and for the member themself. */
  email: z.string().optional(),
  role: ClanRoleSchema,
  joinedAt: DateTimeSchema,
  isYou: z.boolean(),
});
export const MemberListSchema = z.array(MemberSchema);

export const UpdateMemberRequestSchema = z.object({ role: InviteRoleSchema });
export const CreateInviteRequestSchema = z.object({ role: InviteRoleSchema });

/** randomToken(24): 32 URL-safe base64 characters. */
export const InviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32}$/, 'Not an invite token');

export const InviteSchema = z.object({
  id: IdSchema,
  token: InviteTokenSchema,
  role: InviteRoleSchema,
  createdByName: z.string(),
  createdAt: DateTimeSchema,
  expiresAt: DateTimeSchema,
});
export const InviteListSchema = z.array(InviteSchema);

export const InvitePreviewSchema = z.object({
  clanName: z.string(),
  role: InviteRoleSchema,
  invitedByName: z.string(),
  expiresAt: DateTimeSchema,
});

export const AcceptInviteResponseSchema = z.object({
  clanId: IdSchema,
  role: ClanRoleSchema,
  alreadyMember: z.boolean(),
});

export type ClanRole = z.infer<typeof ClanRoleSchema>;
export type InviteRole = z.infer<typeof InviteRoleSchema>;
export type CreateClanRequest = z.infer<typeof CreateClanRequestSchema>;
export type UpdateClanRequest = z.infer<typeof UpdateClanRequestSchema>;
export type Clan = z.infer<typeof ClanSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Invite = z.infer<typeof InviteSchema>;
export type InvitePreview = z.infer<typeof InvitePreviewSchema>;
export type AcceptInviteResponse = z.infer<typeof AcceptInviteResponseSchema>;
