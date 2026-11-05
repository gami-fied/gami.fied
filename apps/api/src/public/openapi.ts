import { PUBLIC_ROUTES } from './routes.js';

const error = { $ref: '#/components/responses/Error' };

function operation(summary: string, scope: string | null, extra: Record<string, unknown> = {}) {
  return {
    summary,
    ...(scope ? { 'x-required-scope': scope } : {}),
    responses: { 200: { description: 'Success' }, default: error },
    ...extra,
  };
}

const jsonBody = (schema: unknown) => ({
  requestBody: { required: true, content: { 'application/json': { schema } } },
});

const eventSchema = {
  type: 'object',
  required: ['event'],
  properties: {
    event: { type: 'string', maxLength: 128 },
    user_id: { type: 'string', description: 'Your ID for the user', maxLength: 128 },
    payload: { type: 'object' },
    occurred_at: { type: 'string', format: 'date-time' },
    idempotency_key: { type: 'string', maxLength: 128 },
  },
};

const endUserOperation = (summary: string) =>
  operation(summary, null, { security: [{ endUserToken: [] }] });

/** Builds the spec from the public route table, so the two cannot disagree. */
export function buildOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {
    '/v1/events': {
      post: operation('Send an event', 'events:write', {
        parameters: [
          {
            in: 'query',
            name: 'wait',
            schema: { type: 'boolean' },
            description: 'Wait up to 5 seconds for rewards and include them in the response.',
          },
        ],
        ...jsonBody(eventSchema),
      }),
    },
    '/v1/events/batch': {
      post: operation('Send up to 100 events', 'events:write', {
        ...jsonBody({
          type: 'object',
          required: ['events'],
          properties: { events: { type: 'array', maxItems: 100, items: eventSchema } },
        }),
      }),
    },
    '/v1/end-user-tokens': {
      post: operation('Create a short-lived token for one user', 'users:write', {
        ...jsonBody({
          type: 'object',
          required: ['userId'],
          properties: {
            userId: { type: 'string' },
            expiresInSeconds: { type: 'integer', minimum: 60, maximum: 3600 },
          },
        }),
      }),
    },
    '/v1/me': { get: endUserOperation('Get the current user') },
    '/v1/me/achievements': { get: endUserOperation("List the current user's achievements") },
    '/v1/me/challenges': { get: endUserOperation("List the current user's challenges") },
    '/v1/me/notifications': { get: endUserOperation("List the current user's notifications") },
    '/v1/me/rank': { get: endUserOperation("Get the current user's rank") },
  };

  for (const route of PUBLIC_ROUTES) {
    const path = `/v1${route.path.replace(/:([A-Za-z]+)/g, '{$1}')}`;
    const parameters = [...route.path.matchAll(/:([A-Za-z]+)/g)].map((match) => ({
      in: 'path',
      name: match[1],
      required: true,
      schema: { type: 'string' },
    }));
    paths[path] ??= {};
    paths[path][route.method.toLowerCase()] = operation(route.summary, route.scope, {
      ...(parameters.length > 0 ? { parameters } : {}),
    });
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Gami.Fied API',
      version: '1.0.0',
      description: 'The stable public API. The API key identifies the project.',
    },
    security: [{ apiKey: [] }],
    paths,
    components: {
      securitySchemes: {
        apiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
        endUserToken: { type: 'http', scheme: 'bearer' },
      },
      responses: {
        Error: {
          description: 'Error',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: {
                    type: 'object',
                    properties: {
                      code: { type: 'string' },
                      message: { type: 'string' },
                      requestId: { type: 'string' },
                      details: {},
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
