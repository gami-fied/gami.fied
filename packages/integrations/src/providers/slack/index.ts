import type { IntegrationConfig, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { WebhookStyleProvider } from '../webhook-provider.js';

/** Slack's own formatting treats these as special, so values from users are made harmless. */
const plain = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const EMOJI: Record<string, string> = {
  xp_awarded: ':sparkles:',
  achievement_unlocked: ':trophy:',
  level_up: ':rocket:',
  challenge_completed: ':dart:',
};

/** Posts to a Slack Incoming Webhook as a Block Kit message. */
export class SlackIntegrationProvider extends WebhookStyleProvider {
  public readonly type: IntegrationProviderType = 'slack';
  protected readonly label = 'Slack';

  protected acceptsUrl(url: URL): boolean {
    return url.hostname === 'hooks.slack.com' || url.hostname === 'hooks.slack-gov.com';
  }

  protected buildPayload(message: IntegrationMessage) {
    const icon = EMOJI[message.eventType] ?? ':bell:';
    const title = `${icon} ${plain(message.title)}`;
    return {
      // The plain text is what notifications and screen readers show.
      text: `${message.title}: ${message.body}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${plain(message.body)}` } },
        ...(message.userName ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `Player: ${plain(message.userName)}` }] }] : []),
      ],
    };
  }

  protected buildTestPayload(config: IntegrationConfig) {
    const project = typeof config.projectName === 'string' ? config.projectName : 'your project';
    return {
      text: `Gami.Fied is connected to ${project}.`,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `:white_check_mark: *Gami.Fied is connected*\nXP, badges and level-ups from ${plain(project)} will appear here.` } }],
    };
  }
}
