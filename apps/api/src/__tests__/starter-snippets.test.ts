import { randomUUID } from 'crypto';
import { runMigrations } from '@gami/database';
import { Gami } from '@gami.fied/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  API_KEY_PLACEHOLDER,
  SAMPLE_EVENT,
  SAMPLE_TRACK,
  starterSnippets,
} from '../../../dashboard/src/lib/starter-snippets.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

/**
 * Developer Hub's starter snippets, sent to a running API the way a developer would copy them, so
 * they break here when the API or the SDK changes (DASH-32).
 */
describe("Developer Hub's starter snippets", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let apiKey: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });

    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `snippets_${randomUUID()}@example.com`, password: 'SecurePassword123!', name: 'Snippet Check' },
    });
    const cookie = signUp.headers['set-cookie'] as string;
    const org = JSON.parse(
      (await app.inject({ method: 'POST', url: '/api/organizations', headers: { cookie }, payload: { name: 'Snippets', slug: `snip-${randomUUID()}` } })).payload
    );
    const project = JSON.parse(
      (
        await app.inject({
          method: 'POST',
          url: '/api/projects',
          headers: { cookie },
          payload: { organizationId: org.id, name: 'Snippets', slug: `snip-${randomUUID()}` },
        })
      ).payload
    );
    // The scopes the snippets need, as Developer Hub tells people to create.
    apiKey = (await createApiKey(project.id, 'Snippet key', ['events:write', 'users:write'])).rawSecret;
  });

  afterAll(async () => {
    await app.close();
  });

  const snippet = (id: string) => starterSnippets(baseUrl).find((item) => item.id === id)!.code;

  it('fills in the API address and leaves a placeholder for the key', () => {
    for (const item of starterSnippets(baseUrl)) {
      if (item.id !== 'token') expect(item.code).toContain(baseUrl);
    }
    expect(snippet('curl')).toContain(API_KEY_PLACEHOLDER);
    expect(snippet('sdk')).toContain(`baseUrl: '${baseUrl}'`);
  });

  it('accepts the curl request', async () => {
    expect(snippet('curl')).toContain(`POST ${baseUrl}/v1/events`);
    expect(snippet('curl')).toContain(JSON.stringify(SAMPLE_EVENT));

    const res = await fetch(`${baseUrl}/v1/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(SAMPLE_EVENT),
    });
    expect(res.status).toBe(202);
  });

  it('accepts the SDK call, and makes a player token for the same player', async () => {
    const gami = new Gami({ apiKey, baseUrl });
    const tracked = await gami.events.track({ ...SAMPLE_TRACK, properties: { ...SAMPLE_TRACK.properties } });
    expect(tracked.status).toBe('accepted');

    const { token } = await gami.endUserTokens.create({ userId: SAMPLE_TRACK.userId });
    expect(token).toEqual(expect.any(String));
    expect(snippet('token')).toContain(`userId: '${SAMPLE_TRACK.userId}'`);
  });
});
