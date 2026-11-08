import { FeatureBoard } from '@/components/features/admin/feature-board';
import { PageHeader } from '@/components/ui/page-header';

export default function AdminFeaturesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Features"
        description="Turn features on or off for every organization on this instance. Organizations can be narrowed further from their own page."
      />
      <FeatureBoard />
    </div>
  );
}
