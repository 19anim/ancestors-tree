import { describe, expect, it } from 'vitest';
import {
  CreateClanRequestSchema,
  hasRoleAtLeast,
  InviteTokenSchema,
  MemberSchema,
  UpdateClanRequestSchema,
} from './clans.ts';

describe('clan contracts', () => {
  it('fills empty optional fields when creating a clan', () => {
    expect(CreateClanRequestSchema.parse({ name: ' Họ Nguyễn ' })).toEqual({
      name: 'Họ Nguyễn',
      hometown: '',
      description: '',
    });
    expect(CreateClanRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('changes only the fields sent when updating a clan', () => {
    expect(UpdateClanRequestSchema.parse({ hometown: 'Nam Định' })).toEqual({
      hometown: 'Nam Định',
    });
    expect(UpdateClanRequestSchema.safeParse({}).success).toBe(false);
  });

  it('orders roles owner > editor > viewer', () => {
    expect(hasRoleAtLeast('owner', 'editor')).toBe(true);
    expect(hasRoleAtLeast('editor', 'editor')).toBe(true);
    expect(hasRoleAtLeast('viewer', 'editor')).toBe(false);
  });

  it('accepts 32-character URL-safe invite tokens only', () => {
    expect(InviteTokenSchema.safeParse('a'.repeat(32)).success).toBe(true);
    expect(InviteTokenSchema.safeParse('a'.repeat(31)).success).toBe(false);
    expect(InviteTokenSchema.safeParse(`${'a'.repeat(31)}/`).success).toBe(false);
  });

  it('allows a member without an email (hidden from non-owners)', () => {
    const member = {
      userId: '64b7f0c2a1b2c3d4e5f60718',
      name: 'Tuấn',
      role: 'viewer',
      joinedAt: '2026-11-13T08:00:00.000Z',
      isYou: false,
    };
    expect(MemberSchema.parse(member)).toEqual(member);
  });
});
