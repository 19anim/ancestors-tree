import { randomBytes } from 'node:crypto';

/** Spec §12: <folder>/clans/<clanId>/people/<personId>/<16 hex>. No names, nothing guessable. */
export function clanPhotoPrefix(folder: string, clanId: string): string {
  return `${folder}/clans/${clanId}/`;
}

export function personPhotoPrefix(folder: string, clanId: string, personId: string): string {
  return `${clanPhotoPrefix(folder, clanId)}people/${personId}/`;
}

export function newPhotoPublicId(folder: string, clanId: string, personId: string): string {
  return personPhotoPrefix(folder, clanId, personId) + randomBytes(8).toString('hex');
}
