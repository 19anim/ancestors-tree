import { CurrentUserSchema, UpdateMeRequestSchema } from '@ancestors-tree/shared';
import type { AuthService } from '../auth/service.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

export function registerMeRoutes(api: RouteRegistry, deps: { auth: AuthService }): void {
  api.define({
    method: 'get',
    path: '/me',
    summary: 'The signed-in user',
    tags: ['Account'],
    access: 'signedIn',
    responses: { 200: { description: 'The signed-in user', schema: CurrentUserSchema } },
    handler: async ({ userId }) => ({ status: 200, body: await deps.auth.getUser(userId()) }),
  });

  api.define({
    method: 'patch',
    path: '/me',
    summary: 'Change your name or language',
    tags: ['Account'],
    access: 'signedIn',
    request: { body: UpdateMeRequestSchema },
    responses: { 200: { description: 'The updated user', schema: CurrentUserSchema } },
    handler: async ({ userId, body }) => ({
      status: 200,
      body: await deps.auth.updateProfile(userId(), body),
    }),
  });
}
