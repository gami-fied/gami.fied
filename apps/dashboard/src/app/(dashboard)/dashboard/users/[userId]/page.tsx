import { UserDetailView } from '@/components/features/users/user-detail-view';

export default async function UserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <UserDetailView userId={userId} />;
}
