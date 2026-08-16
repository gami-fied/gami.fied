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
    sublabel: `${org.slug} • ${(org.role || 'member').toUpperCase()}`,
    icon: <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />,
  }));

  return (
    <>
      <div className="w-52 sm:w-64">
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
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        title="Create Organization"
        description="Add a new organization to manage team members, roles, and project access."
      >
        <form onSubmit={handleCreateOrg} className="space-y-4 font-mono text-xs">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <span className="text-rose-400 font-bold">⚠</span>
              <span>{error}</span>
            </div>
          )}
          <Input
            label="Organization Name *"
            placeholder="e.g. Acme Corporation"
            value={name}
            onChange={(e) => {
              const newName = e.target.value;
              setName(newName);
              setSlug(newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
            }}
            required
          />
          <Input
            label="Organization Slug *"
            placeholder="e.g. acme-corp"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''))}
            required
            helperText="Unique identifier used in URLs and API routing."
          />
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsModalOpen(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white font-medium"
            >
              Create Organization
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
