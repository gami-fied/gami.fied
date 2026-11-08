import { PolicyForm } from '@/components/features/admin/policy-form';
import { PageHeader } from '@/components/ui/page-header';

export default function AdminPoliciesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization defaults"
        description="Limits and security rules every organization gets, unless its own page says otherwise."
      />
      <PolicyForm />
    </div>
  );
}
