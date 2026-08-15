'use client';

import React, { useState } from 'react';
import { useDashboard } from '../features/context/dashboard-context';
import { Building2 } from 'lucide-react';
import { Dropdown } from '../ui/dropdown';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export function OrganizationSwitcher() {
  const { organizations, selectedOrg, setSelectedOrg, createOrganization } = useDashboard();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await createOrganization(name, slug);
      setName('');
      setSlug('');
      setIsModalOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  const dropdownOptions = organizations.map((org) => ({
    value: org.id,
    label: org.name,
    sublabel: org.slug,
    icon: <Building2 className="w-3.5 h-3.5 text-zinc-400" />,
  }));

  return (
    <>
      <div className="w-48 sm:w-56">
        <Dropdown
          options={dropdownOptions}
          value={selectedOrg?.id || null}
          onChange={(val) => {
            const org = organizations.find((o) => o.id === val);
            if (org) setSelectedOrg(org);
          }}
          placeholder="Select Organization"
          actionLabel="+ Create New Organization"
          onActionClick={() => setIsModalOpen(true)}
        />
      </div>

      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Organization"
        description="Add a new organization to manage workspaces and team access."
      >
        <form onSubmit={handleCreateOrg} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
              {error}
            </div>
          )}
          <Input
            label="Organization Name"
            placeholder="e.g. Acme Corp"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            }}
            required
          />
          <Input
            label="Organization Slug"
            placeholder="e.g. acme-corp"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              Create Organization
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
