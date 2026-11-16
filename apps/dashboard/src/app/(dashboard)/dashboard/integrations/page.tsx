import { IntegrationsView } from '@/components/features/integrations/integrations-view';

export const metadata = {
  description: 'Manage external platform integrations such as Discord to deliver real-time gamification notifications.',
};

export default function IntegrationsPage() {
  return <IntegrationsView />;
}
