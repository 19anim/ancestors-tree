import { IdSchema, PhotoUploadResponseSchema } from '@ancestors-tree/shared';
import { z } from 'zod';
import { AppError } from '../http/AppError.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';
import { PersonModel } from '../models/Person.ts';
import { newPhotoPublicId } from '../photos/paths.ts';
import type { PhotoStore } from '../photos/store.ts';

const ParamsSchema = z.object({ id: IdSchema, personId: IdSchema });

export function registerPhotoRoutes(api: RouteRegistry, deps: { photos?: PhotoStore }): void {
  api.define({
    method: 'post',
    path: '/clans/:id/people/:personId/photo-upload',
    summary: "Sign one upload of this person's photo (spec §12)",
    tags: ['Tree'],
    access: { clanRole: 'editor' },
    request: { params: ParamsSchema },
    responses: {
      200: { description: 'Where and what to post', schema: PhotoUploadResponseSchema },
    },
    handler: async ({ params }) => {
      const { photos } = deps;
      if (photos === undefined) {
        throw new AppError('PHOTOS_NOT_CONFIGURED', 'Photos are not set up on this server');
      }
      const exists = await PersonModel.exists({ _id: params.personId, clanId: params.id });
      if (exists === null) throw new AppError('NOT_FOUND', 'No such person in this family tree');
      const publicId = newPhotoPublicId(photos.folder, params.id, params.personId);
      return { status: 200, body: { publicId, ...photos.signUpload(publicId, params.id) } };
    },
  });
}
