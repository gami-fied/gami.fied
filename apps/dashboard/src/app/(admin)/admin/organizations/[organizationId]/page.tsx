import { OrganizationDetail } from '@/components/features/admin/organization-detail';

export default async function AdminOrganizationPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  return <OrganizationDetail organizationId={organizationId} />;
}
