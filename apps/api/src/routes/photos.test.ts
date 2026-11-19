import { newObjectId } from '@ancestors-tree/shared/tree';
import { describe, expect, it } from 'vitest';
import { PersonModel } from '../models/Person.ts';
import { createMemoryPhotoStore } from '../photos/store.ts';
import { createTestApp } from '../test/app.ts';
import { addMember, createClan } from '../test/clans.ts';
import { useTestDatabase } from '../test/database.ts';
import { signUp } from '../test/users.ts';

useTestDatabase();

const photos = createMemoryPhotoStore({ folder: 'ancestors-tree/test' });
const { app } = createTestApp({ photos });

type Member = Awaited<ReturnType<typeof signUp>>;

async function insertPerson(clanId: string): Promise<string> {
  const id = newObjectId();
  await PersonModel.create({
    _id: id,
    clanId,
    fullName: 'Nguyễn Văn Tư',
    aliases: [],
    gender: 'male',
    death: { isDeceased: false },
    isAdopted: false,
  });
  return id;
}

/** An owner with a new family tree holding one person, plus an editor and a viewer of it. */
async function setup(onApp = app) {
  const owner = await signUp(onApp);
  const editor = await signUp(onApp);
  const viewer = await signUp(onApp);
  const clan = await createClan(owner.agent);
  await addMember(clan.id, editor.user.id, 'editor');
  await addMember(clan.id, viewer.user.id, 'viewer');
  const personId = await insertPerson(clan.id);
  return { owner, editor, viewer, clanId: clan.id, personId };
}

function requestUpload(member: Member, clanId: string, personId: string) {
  return member.agent.post(`/api/clans/${clanId}/people/${personId}/photo-upload`).send({});
}

describe('POST /api/clans/:id/people/:personId/photo-upload', () => {
  it('signs a new, unguessable public id under the person for an editor', async () => {
    const { editor, clanId, personId } = await setup();
    const response = await requestUpload(editor, clanId, personId);
    expect(response.status).toBe(200);
    const body = response.body as { publicId: string; url: string; fields: Record<string, string> };
    expect(body.publicId).toMatch(
      new RegExp(`^ancestors-tree/test/clans/${clanId}/people/${personId}/[0-9a-f]{16}$`),
    );
    expect(body.fields.public_id).toBe(body.publicId);
    expect(body.fields.tags).toBe(`clan_${clanId}`);
  });

  it('is for editors only', async () => {
    const { viewer, clanId, personId } = await setup();
    const response = await requestUpload(viewer, clanId, personId);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('answers 404 to a person of another clan, or an unknown one', async () => {
    const { editor, clanId } = await setup();
    const other = await setup();
    for (const personId of [other.personId, newObjectId()]) {
      const response = await requestUpload(editor, clanId, personId);
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });

  it('answers 503 when photos are not configured', async () => {
    const { app: bare } = createTestApp({ photos: undefined });
    const { editor, clanId, personId } = await setup(bare);
    const response = await requestUpload(editor, clanId, personId);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'PHOTOS_NOT_CONFIGURED' } });
  });
});
