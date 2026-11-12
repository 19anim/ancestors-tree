import { ClanSchema, type Clan, type ClanRole } from '@ancestors-tree/shared';
import type request from 'supertest';
import { Membership } from '../models/Membership.ts';

type Agent = ReturnType<typeof request.agent>;

export async function createClan(
  agent: Agent,
  body: { name: string; hometown?: string } = { name: 'Họ Nguyễn' },
): Promise<Clan> {
  const response = await agent.post('/api/clans').send(body);
  if (response.status !== 201) {
    throw new Error(`Create clan failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return ClanSchema.parse(response.body);
}

/** Adds a member directly (the invite flow has its own tests). */
export async function addMember(clanId: string, userId: string, role: ClanRole): Promise<void> {
  await Membership.create({ clanId, userId, role });
}
