import { WebhooksView } from '@/components/features/webhooks/webhooks-view';

export const metadata = {
  title: 'Webhooks | Gami Dashboard',
  description: 'Manage project webhook endpoints and external event delivery',
};

export default function WebhooksPage() {
  return <WebhooksView />;
}
