import { IntegrationsView } from '@/components/features/integrations/integrations-view';

export const metadata = {
  title: 'Integrations & External Channels | Gami Dashboard',
  description: 'Manage external platform integrations such as Discord to deliver real-time gamification notifications.',
};

export default function IntegrationsPage() {
  return <IntegrationsView />;
}
