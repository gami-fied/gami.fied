import { randomUUID } from 'crypto';
import {
  achievements,
  challenges,
  db,
  endUsers,
  levels,
  organizations,
  projects,
  runMigrations,
  userAchievements,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { buildOpenApiDocument } from '../public/openapi.js';
import { PUBLIC_ROUTES } from '../public/routes.js';
import { createApiKey } from '../services/api-key.service.js';

type Schema = {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  allOf?: Schema[];
  enum?: unknown[];
  additionalProperties?: boolean;
};

interface Operation {
  parameters?: { name: string; in: string; required?: boolean }[];
  requestBody?: { content: Record<string, { example: unknown; schema: Schema }> };
  responses: Record<string, { content?: Record<string, { schema: Schema }> }>;
  security?: unknown[];
}

const document = JSON.parse(JSON.stringify(buildOpenApiDocument()));

function resolve(schema: Schema): Schema {
  if (!schema.$ref) return schema;
  const name = schema.$ref.split('/').pop() as string;
  return { ...document.components.schemas[name], ...schema, $ref: undefined };
}

function fieldsOf(schema: Schema): Schema {
  const parts = (schema.allOf ?? []).map(resolve);
  return {
    ...schema,
    properties: Object.assign({}, ...parts.map((part) => part.properties), schema.properties),
    required: [...parts.flatMap((part) => part.required ?? []), ...(schema.required ?? [])],
  };
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

/** Lists every way a value differs from its documented schema, undocumented fields included. */
function mismatches(input: Schema, value: unknown, at: string): string[] {
  const schema = fieldsOf(resolve(input));
  const types = [schema.type ?? []].flat();
  const actual = typeOf(value);
  if (types.length > 0 && !types.includes(actual) && !(actual === 'integer' && types.includes('number'))) {
    return [`${at}: documented ${types.join('|')}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value)) return [`${at}: ${String(value)} not in enum`];

  if (actual === 'array') {
    return (value as unknown[]).flatMap((item, index) =>
      schema.items ? mismatches(schema.items, item, `${at}[${index}]`) : []
    );
  }
  if (actual !== 'object' || schema.additionalProperties || !Object.keys(schema.properties ?? {}).length) {
    return [];
  }

  const record = value as Record<string, unknown>;
  const documented = schema.properties as Record<string, Schema>;
  return [
    ...(schema.required ?? []).filter((key) => !(key in record)).map((key) => `${at}.${key}: missing`),
    ...Object.keys(record).filter((key) => !documented[key]).map((key) => `${at}.${key}: undocumented`),
    ...Object.keys(record)
      .filter((key) => documented[key])
      .flatMap((key) => mismatches(documented[key] as Schema, record[key], `${at}.${key}`)),
  ];
}

const operations = Object.entries(document.paths as Record<string, Record<string, Operation>>).flatMap(
  ([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({ path, method, operation }))
);

/** Reads first, so writes can't change what they see, and the erase last of all. */
function order(path: string, method: string): number {
  if (path.endsWith('/erase')) return 4;
  if (method === 'delete') return 3;
  return method === 'get' ? 1 : 2;
}

describe('API docs contract', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let apiKey: string;
  let endUserToken = '';
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_doc_${suffix}`;
  const projectId = `prj_doc_${suffix}`;
  const pathValues = {
    userId: `usr_doc_${suffix}`,
    externalId: 'user_123',
    achievementId: `ach_doc_${suffix}`,
    challengeId: `chl_doc_${suffix}`,
    levelId: `lvl_doc_${suffix}`,
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Docs', slug: `doc-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Docs', slug: 'docs' });
    const { userId, achievementId, challengeId, levelId } = pathValues;
    await db.insert(endUsers).values({ id: userId, projectId, externalId: 'user_123', name: 'Ada' });
    await db.insert(userXpBalances).values({ id: `xpb_${suffix}`, projectId, userId, totalXp: 750 });
    await db.insert(xpLedger).values({
      id: `xp_${suffix}`,
      projectId,
      userId,
      amount: 750,
      reason: 'seed',
    });
    await db.insert(levels).values([
      { id: levelId, projectId, level: 1, name: 'Beginner', requiredXp: 0 },
      { id: `lvl2_${suffix}`, projectId, level: 2, name: 'Explorer', requiredXp: 500 },
    ]);
    await db.insert(achievements).values({ id: achievementId, projectId, key: 'first', name: 'First' });
    await db.insert(userAchievements).values({
      id: `uach_${suffix}`,
      projectId,
      userId,
      achievementId,
    });
    await db.insert(challenges).values({
      id: challengeId,
      projectId,
      key: 'ten',
      name: 'Ten',
      trigger: 'order_completed',
      target: 10,
      rewards: [{ type: 'xp', amount: 100 }],
    });

    apiKey = (await createApiKey(projectId, 'Docs', ['*'])).rawSecret;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('documents every public route', () => {
    for (const route of PUBLIC_ROUTES) {
      const path = `/v1${route.path.replace(/:([A-Za-z]+)/g, '{$1}')}`;
      expect(document.paths[path]?.[route.method.toLowerCase()]).toBeDefined();
    }
  });

  it('describes every field, parameter and response', () => {
    for (const { path, method, operation } of operations) {
      const name = `${method} ${path}`;
      expect((operation as { summary?: string }).summary, name).toBeTruthy();
      expect((operation as { description?: string }).description, name).toBeTruthy();
      for (const parameter of operation.parameters ?? []) {
        expect((parameter as { description?: string }).description, `${name} ${parameter.name}`).toBeTruthy();
      }
      const success = Object.keys(operation.responses).find((code) => code.startsWith('2'));
      expect(success, name).toBeDefined();
      expect(operation.responses[success as string]?.content, name).toBeDefined();
      const example = operation.requestBody?.content['application/json']?.example;
      if (operation.requestBody) expect(example, `${name} example`).toBeDefined();
    }
  });

  it('accepts your own ID wherever a path takes a user ID', async () => {
    const reads = operations.filter(
      ({ path, method }) => method === 'get' && path.includes('{userId}')
    );
    expect(reads.length).toBeGreaterThan(5);

    for (const { path } of reads) {
      const url = (userId: string) =>
        path.replace(/\{(\w+)\}/g, (_, name: keyof typeof pathValues) =>
          name === 'userId' ? userId : pathValues[name]
        );
      const headers = { 'x-api-key': apiKey };
      const byGamiId = await app.inject({ method: 'GET', url: url(pathValues.userId), headers });
      const byOwnId = await app.inject({ method: 'GET', url: url('user_123'), headers });

      expect(byGamiId.statusCode, path).toBe(200);
      expect(byOwnId.statusCode, path).toBe(200);
      expect(byOwnId.json(), path).toEqual(byGamiId.json());
    }
  });

  it('matches what the API really returns, using the documented examples', async () => {
    const problems: string[] = [];
    const sorted = [...operations].sort(
      (a, b) => order(a.path, a.method) - order(b.path, b.method)
    );

    // Tokens come first, because the `/v1/me` routes need one.
    const tokenRoute = sorted.findIndex(({ path }) => path === '/v1/end-user-tokens');
    sorted.unshift(...sorted.splice(tokenRoute, 1));

    for (const { path, method, operation } of sorted) {
      // A stream never finishes, so it has its own tests (realtime.test.ts).
      if (path === '/v1/me/stream') continue;
      // Buying needs points and stock, which the documented example user does not have.
      if (path.endsWith('/redeem')) continue;
      const url = path.replace(/\{(\w+)\}/g, (_, name: keyof typeof pathValues) => pathValues[name]);
      const example = operation.requestBody?.content['application/json']?.example;
      const res = await app.inject({
        method: method.toUpperCase() as 'GET',
        url,
        headers: operation.security
          ? { authorization: `Bearer ${endUserToken}` }
          : { 'x-api-key': apiKey },
        ...(example === undefined ? {} : { payload: example as object }),
      });

      const name = `${method.toUpperCase()} ${path}`;
      const success = Object.keys(operation.responses).find((code) => code.startsWith('2')) as string;
      if (String(res.statusCode) !== success) {
        problems.push(`${name}: documented ${success}, got ${res.statusCode}: ${res.payload.slice(0, 200)}`);
        continue;
      }

      const schema = operation.responses[success]?.content?.['application/json']?.schema as Schema;
      problems.push(...mismatches(schema, res.json(), name));
      if (path === '/v1/end-user-tokens') endUserToken = res.json().token;
    }

    expect(problems).toEqual([]);
  });
});
