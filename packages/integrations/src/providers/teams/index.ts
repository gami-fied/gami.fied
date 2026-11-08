import type { IntegrationConfig, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { WebhookStyleProvider } from '../webhook-provider.js';

const ALLOWED_SUFFIXES = ['.webhook.office.com', '.logic.azure.com', '.powerplatform.com', '.environment.api.powerplatform.com'];

/** An Adaptive Card message, which Teams Workflows webhooks accept. */
function card(title: string, body: string, footer?: string) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
            { type: 'TextBlock', text: body, wrap: true },
            ...(footer ? [{ type: 'TextBlock', text: footer, isSubtle: true, size: 'Small', wrap: true }] : []),
          ],
        },
      },
    ],
  };
}

/** Posts to a Microsoft Teams Workflows (Power Automate) or Office 365 connector webhook. */
export class TeamsIntegrationProvider extends WebhookStyleProvider {
  public readonly type: IntegrationProviderType = 'teams';
  protected readonly label = 'Microsoft Teams';

  protected acceptsUrl(url: URL): boolean {
    return url.hostname === 'webhook.office.com' || ALLOWED_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  }

  protected buildPayload(message: IntegrationMessage) {
    return card(message.title, message.body, message.userName ? `Player: ${message.userName}` : undefined);
  }

  protected buildTestPayload(config: IntegrationConfig) {
    const project = typeof config.projectName === 'string' ? config.projectName : 'your project';
    return card('Gami.Fied is connected', `XP, badges and level-ups from ${project} will appear here.`);
  }
}
