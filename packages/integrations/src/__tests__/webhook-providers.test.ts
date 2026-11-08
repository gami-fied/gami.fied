import { calculateTimestampedSignature, encryptSecret } from '@gami/webhooks';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent: { url: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
let respond: () => Response = () => new Response('ok', { status: 200 });

vi.mock('@gami/webhooks', async (importOriginal) => {
  const original = await importOriginal<typeof import('@gami/webhooks')>();
  return {
    ...original,
    // No network in tests: record the request and answer with whatever the test set up.
    fetchWithSsrfProtection: vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init: init as never });
      return respond();
    }),
    validateWebhookUrl: vi.fn(async (url: string) =>
      url.includes('10.0.0.5') ? { valid: false, error: 'Private address' } : { valid: true }
    ),
  };
});

const { HttpIntegrationProvider, SlackIntegrationProvider, TeamsIntegrationProvider } = await import('../index.js');

const message = {
  eventType: 'achievement_unlocked',
  userId: 'usr_1',
  userName: 'Ada <@everyone>',
  title: 'Badge & <b>glory</b>',
  body: 'Ada earned Bookworm',
};

beforeEach(() => {
  sent.length = 0;
  respond = () => new Response('ok', { status: 200 });
});

describe('Slack', () => {
  const provider = new SlackIntegrationProvider();

  it('accepts only Slack webhook addresses over HTTPS', async () => {
    expect(await provider.validateConfig({ webhookUrl: 'https://hooks.slack.com/services/T0/B0/xxxx' })).toBe(true);
    expect(await provider.validateConfig({ webhookUrl: 'http://hooks.slack.com/services/T0/B0/xxxx' })).toBe(false);
    expect(await provider.validateConfig({ webhookUrl: 'https://hooks.slack.com.evil.example/services/x' })).toBe(false);
    expect(await provider.validateConfig({ webhookUrl: 'https://example.com/hook' })).toBe(false);
    expect(await provider.validateConfig({})).toBe(false);
  });

  it('posts a Block Kit message, with user text made harmless', async () => {
    const result = await provider.sendNotification({ webhookUrl: 'https://hooks.slack.com/services/T0/B0/xxxx' }, message);
    expect(result.success).toBe(true);

    const body = JSON.parse(sent[0]!.init.body as string);
    expect(body.text).toContain('Badge & <b>glory</b>'); // plain text fallback
    const section = body.blocks[0].text.text as string;
    expect(section).toContain(':trophy:');
    expect(section).toContain('Badge &amp; &lt;b&gt;glory&lt;/b&gt;');
    expect(JSON.stringify(body.blocks)).toContain('Ada &lt;@everyone&gt;');
    expect(JSON.stringify(body.blocks)).not.toContain('<@everyone>');
  });

  it('works from an encrypted address, as it is stored', async () => {
    const encryptedWebhookUrl = encryptSecret('https://hooks.slack.com/services/T0/B0/xxxx');
    expect((await provider.sendNotification({ encryptedWebhookUrl }, message)).success).toBe(true);
    expect(sent[0]!.url).toBe('https://hooks.slack.com/services/T0/B0/xxxx');
  });

  it('skips event types that are turned off, without calling Slack', async () => {
    const result = await provider.sendNotification(
      { webhookUrl: 'https://hooks.slack.com/services/T0/B0/xxxx', enabledEvents: ['level_up'] },
      message
    );
    expect(result.success).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('sends a test message', async () => {
    const result = await provider.testConnection({ webhookUrl: 'https://hooks.slack.com/services/T0/B0/xxxx', projectName: 'Acme' });
    expect(result.success).toBe(true);
    expect(JSON.parse(sent[0]!.init.body as string).text).toContain('Acme');
  });

  it('retries server errors and rate limits, but not a deleted webhook', async () => {
    const config = { webhookUrl: 'https://hooks.slack.com/services/T0/B0/xxxx' };
    respond = () => new Response('boom', { status: 503 });
    expect(await provider.sendNotification(config, message)).toMatchObject({ success: false, retryable: true });
    respond = () => new Response('slow down', { status: 429 });
    expect(await provider.sendNotification(config, message)).toMatchObject({ success: false, retryable: true });
    respond = () => new Response('no_service', { status: 404 });
    expect(await provider.sendNotification(config, message)).toMatchObject({ success: false, retryable: false });
  });

  it('reports a missing address as a permanent failure', async () => {
    expect(await provider.sendNotification({}, message)).toMatchObject({ success: false, retryable: false });
  });
});

describe('Teams', () => {
  const provider = new TeamsIntegrationProvider();

  it('accepts Teams workflow and connector addresses only', async () => {
    for (const ok of [
      'https://contoso.webhook.office.com/webhookb2/abc',
      'https://prod-12.westus.logic.azure.com:443/workflows/abc',
      'https://default123.4a.environment.api.powerplatform.com/powerautomate/abc',
    ]) {
      expect(await provider.validateConfig({ webhookUrl: ok }), ok).toBe(true);
    }
    expect(await provider.validateConfig({ webhookUrl: 'https://logic.azure.com.evil.example/x' })).toBe(false);
    expect(await provider.validateConfig({ webhookUrl: 'https://example.com/x' })).toBe(false);
  });

  it('posts an Adaptive Card', async () => {
    await provider.sendNotification({ webhookUrl: 'https://contoso.webhook.office.com/webhookb2/abc' }, message);
    const body = JSON.parse(sent[0]!.init.body as string);
    expect(body.type).toBe('message');
    const card = body.attachments[0];
    expect(card.contentType).toBe('application/vnd.microsoft.card.adaptive');
    expect(card.content.type).toBe('AdaptiveCard');
    expect(card.content.body[0].text).toBe('Badge & <b>glory</b>');
    expect(card.content.body[2].text).toBe('Player: Ada <@everyone>');
  });
});

describe('generic HTTP', () => {
  const provider = new HttpIntegrationProvider();
  const url = 'https://hooks.example.com/gami';

  it('needs HTTPS', async () => {
    expect(await provider.validateConfig({ webhookUrl: url })).toBe(true);
    expect(await provider.validateConfig({ webhookUrl: 'http://hooks.example.com/gami' })).toBe(false);
  });

  it('sends a simple JSON body', async () => {
    await provider.sendNotification({ webhookUrl: url }, { ...message, metadata: { achievementKey: 'bookworm' } });
    expect(sent[0]!.init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(sent[0]!.init.body as string)).toMatchObject({
      type: 'achievement_unlocked',
      title: 'Badge & <b>glory</b>',
      user: { id: 'usr_1', name: 'Ada <@everyone>' },
      metadata: { achievementKey: 'bookworm' },
    });
  });

  it('signs requests when a secret is saved, so the receiver can verify them', async () => {
    const secret = 'whsec_test_secret_value';
    await provider.sendNotification({ webhookUrl: url, encryptedSigningSecret: encryptSecret(secret) }, message);

    const { headers, body } = { headers: sent[0]!.init.headers, body: sent[0]!.init.body as string };
    const timestamp = Number(headers['X-Gami-Timestamp']);
    expect(Math.abs(Date.now() / 1000 - timestamp)).toBeLessThan(10);
    expect(headers['X-Gami-Signature-V2']).toBe(calculateTimestampedSignature(body, secret, timestamp));
  });

  it('sends no signature headers without a secret', async () => {
    await provider.sendNotification({ webhookUrl: url }, message);
    expect(sent[0]!.init.headers['X-Gami-Signature']).toBeUndefined();
  });

  it('refuses addresses on a private network and never sends', async () => {
    const result = await provider.sendNotification({ webhookUrl: 'https://10.0.0.5/hook' }, message);
    expect(result).toMatchObject({ success: false, retryable: false, error: 'Private address' });
    expect(sent).toHaveLength(0);
  });
});
