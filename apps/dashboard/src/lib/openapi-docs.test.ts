import { describe, expect, it } from 'vitest';
import {
  codeSample,
  exampleFor,
  fieldRows,
  filterGroups,
  groupEndpoints,
  typeLabel,
  type Endpoint,
  type OpenApiSpec,
} from './openapi-docs';

const spec: OpenApiSpec = {
  info: { title: 'Test', version: '1' },
  tags: [{ name: 'Users' }, { name: 'Current user' }],
  paths: {
    '/v1/users/{userId}': {
      patch: {
        operationId: 'patchUser',
        tags: ['Users'],
        summary: 'Update a user',
        requestBody: {
          content: { 'application/json': { schema: {}, example: { active: true, name: "O'Brien" } } },
        },
        responses: { 200: { description: 'OK' }, 404: { description: 'Missing' } },
      },
    },
    '/v1/me': {
      get: {
        operationId: 'getMe',
        tags: ['Current user'],
        summary: 'Get the current user',
        security: [{ endUserToken: [] }],
        responses: { 200: { description: 'OK' } },
      },
    },
  },
  components: {
    schemas: {
      Reward: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['xp'], example: 'xp' },
          amount: { type: 'integer', minimum: 1, example: 100 },
        },
      },
    },
  },
};

const groups = groupEndpoints(spec);
const [patchUser, getMe] = groups.flatMap((group) => group.endpoints) as [Endpoint, Endpoint];

describe('groupEndpoints', () => {
  it('keeps the order of the tags', () => {
    expect(groups.map((group) => group.name)).toEqual(['Users', 'Current user']);
  });
});

describe('filterGroups', () => {
  it('matches words in any order, and drops empty groups', () => {
    expect(filterGroups(groups, 'user update').map((group) => group.name)).toEqual(['Users']);
    expect(filterGroups(groups, 'nothing here')).toEqual([]);
  });
});

describe('fieldRows', () => {
  const schema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 128, description: 'Name' },
      limit: { type: 'integer', default: 20, maximum: 100 },
      rewards: { type: 'array', items: { $ref: '#/components/schemas/Reward' } },
    },
  };
  const rows = fieldRows(spec, schema);

  it('marks required fields', () => {
    expect(rows.find((row) => row.name === 'name')?.required).toBe(true);
    expect(rows.find((row) => row.name === 'limit')?.required).toBe(false);
  });

  it('explains limits and defaults', () => {
    expect(rows.find((row) => row.name === 'name')?.notes).toEqual(['1 to 128 characters']);
    expect(rows.find((row) => row.name === 'limit')?.notes).toEqual(['Default: `20`', 'Up to 100']);
  });

  it('includes fields nested inside arrays', () => {
    const nested = rows.find((row) => row.name === 'rewards.type');
    expect(nested).toMatchObject({ required: true, depth: 1 });
    expect(nested?.notes).toEqual(['One of: `xp`']);
  });
});

describe('typeLabel', () => {
  it('names nullable, dated and array types', () => {
    expect(typeLabel(spec, { type: ['string', 'null'] })).toBe('string or null');
    expect(typeLabel(spec, { type: 'string', format: 'date-time' })).toBe('string (date-time)');
    expect(typeLabel(spec, { type: 'array', items: { type: 'integer' } })).toBe('array of integer');
  });
});

describe('exampleFor', () => {
  it('builds from the examples on each field', () => {
    expect(exampleFor(spec, { $ref: '#/components/schemas/Reward' })).toEqual({
      type: 'xp',
      amount: 100,
    });
  });
});

describe('codeSample', () => {
  const BASE = 'https://gami.example';

  it('escapes quotes in cURL bodies', () => {
    const sample = codeSample(patchUser, BASE, 'curl');
    expect(sample).toContain(`curl -X PATCH 'https://gami.example/v1/users/user_123'`);
    expect(sample).toContain(`O'\\''Brien`);
  });

  it('uses Python values', () => {
    const sample = codeSample(patchUser, BASE, 'python');
    expect(sample).toContain('requests.patch(');
    expect(sample).toContain('"active": True');
  });

  it('sends an end-user token to /v1/me', () => {
    const sample = codeSample(getMe, BASE, 'javascript');
    expect(sample).toContain(`'Authorization': 'Bearer YOUR_END_USER_TOKEN'`);
    expect(sample).not.toContain('x-api-key');
  });
});
