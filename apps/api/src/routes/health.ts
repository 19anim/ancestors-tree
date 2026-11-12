import { HealthResponseSchema } from '@ancestors-tree/shared';
import { databaseState } from '../db/connect.ts';
import type { RouteRegistry } from '../http/routeRegistry.ts';

export function registerHealthRoutes(api: RouteRegistry, info: { version: string }): void {
  api.define({
    method: 'get',
    path: '/health',
    summary: 'Service health check',
    tags: ['System'],
    access: 'public',
    responses: { 200: { description: 'The API is running', schema: HealthResponseSchema } },
    handler: () => ({
      status: 200,
      body: {
        status: 'ok' as const,
        version: info.version,
        uptimeSeconds: Math.round(process.uptime()),
        database: databaseState(),
      },
    }),
  });
}
