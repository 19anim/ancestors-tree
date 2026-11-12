import { OpenApiGeneratorV31, type OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

export function buildOpenApiDocument(
  registry: OpenAPIRegistry,
  info: { version: string },
): OpenApiDocument {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'AncestorsTree API',
      version: info.version,
      description:
        'REST API of the AncestorsTree genealogy platform. Every error response uses the ApiErrorBody schema; codes are listed in docs/error-codes.md.',
    },
    servers: [{ url: '/api' }],
  });
}
