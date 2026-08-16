import { InvitationsView } from '@/components/features/organization/invitations-view';

export const metadata = {
  title: 'Organization Invitations | Gami Community Engine',
  description: 'Manage pending and past organization invitations.',
};

export default function InvitationsPage() {
  return <InvitationsView />;
}
