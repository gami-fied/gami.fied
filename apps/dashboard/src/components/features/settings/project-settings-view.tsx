'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useDashboard } from '../context/dashboard-context';
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning';
import { PageHeader } from '@/components/ui/page-header';

async function send(url: string, method: string, body?: object): Promise<void> {
  const res = await apiFetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Request failed');
  }
}

function DeleteDialog({
  label,
  name,
  isOpen,
  onClose,
  onDelete,
}: {
  label: string;
  name: string;
  isOpen: boolean;
  onClose: () => void;
  onDelete: () => Promise<void>;
}) {
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Delete ${label}`}
      description="This permanently deletes all of its data and can't be undone."
      maxWidth="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={typed !== name}
            isLoading={deleting}
            onClick={confirmDelete}
          >
            Delete {label}
          </Button>
        </>
      }
    >
      <label htmlFor="confirm-delete" className="block text-sm text-zinc-300">
        Type <strong className="text-white">{name}</strong> to confirm.
      </label>
      <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} />
    </Dialog>
  );
}

export function ProjectSettingsView() {
  const router = useRouter();
  const toast = useToast();
  const { selectedOrg, selectedProject, fetchOrganizations } = useDashboard();

  const [projectName, setProjectName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [origins, setOrigins] = useState('');
  const [deleting, setDeleting] = useState<'project' | 'organization' | null>(null);

  useEffect(() => {
    setProjectName(selectedProject?.name ?? '');
    setOrigins((selectedProject?.allowedOrigins ?? []).join('\n'));
  }, [selectedProject]);

  useEffect(() => {
    setOrgName(selectedOrg?.name ?? '');
  }, [selectedOrg]);

  const savedOrigins = (selectedProject?.allowedOrigins ?? []).join('\n');
  useUnsavedWarning(
    projectName !== (selectedProject?.name ?? '') ||
      origins !== savedOrigins ||
      orgName !== (selectedOrg?.name ?? '')
  );

  if (!selectedOrg || !selectedProject) return null;

  const run = async (action: () => Promise<void>, success: string) => {
    try {
      await action();
      await fetchOrganizations();
      toast.success(success);
    } catch (err: unknown) {
      toast.error('Could not save', (err as Error).message);
    }
  };

  const saveProject = (event: React.FormEvent) => {
    event.preventDefault();
    const allowedOrigins = origins
      .split('\n')
      .map((origin) => origin.trim())
      .filter(Boolean);
    return run(
      () =>
        send(`/api/projects/${selectedProject.id}`, 'PATCH', { name: projectName, allowedOrigins }),
      'Project saved'
    );
  };

  const saveOrganization = (event: React.FormEvent) => {
    event.preventDefault();
    return run(
      () => send(`/api/organizations/${selectedOrg.id}`, 'PATCH', { name: orgName }),
      'Organization saved'
    );
  };

  const remove = async (url: string, success: string) => {
    await run(() => send(url, 'DELETE'), success);
    setDeleting(null);
    router.push('/dashboard');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage this project and organization. Instance settings are in the admin area."
      />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>{selectedProject.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProject} className="space-y-4">
              <div>
                <label htmlFor="project-name" className="block text-sm text-zinc-300 mb-1">
                  Project name
                </label>
                <Input
                  id="project-name"
                  required
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="allowed-origins" className="block text-sm text-zinc-300 mb-1">
                  Sites allowed to use end-user tokens
                </label>
                <textarea
                  id="allowed-origins"
                  rows={3}
                  value={origins}
                  onChange={(e) => setOrigins(e.target.value)}
                  placeholder="https://app.example.com"
                  className="w-full bg-zinc-950 border border-zinc-800 p-2 text-sm text-zinc-100 focus:border-brand-500"
                />
                <p className="text-xs text-zinc-400 mt-1">
                  One per line, with no path. Leave empty to allow any site.
                </p>
              </div>
              <Button type="submit">Save project</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
              <CardDescription>{selectedOrg.slug}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveOrganization} className="space-y-4">
                <div>
                  <label htmlFor="org-name" className="block text-sm text-zinc-300 mb-1">
                    Organization name
                  </label>
                  <Input
                    id="org-name"
                    required
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                  />
                </div>
                <Button type="submit">Save organization</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Danger zone</CardTitle>
              <CardDescription>Deleting can&apos;t be undone.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button variant="danger" onClick={() => setDeleting('project')}>
                Delete project
              </Button>
              {selectedOrg.role === 'owner' && (
                <Button variant="danger" onClick={() => setDeleting('organization')}>
                  Delete organization
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <DeleteDialog
        label="project"
        name={selectedProject.name}
        isOpen={deleting === 'project'}
        onClose={() => setDeleting(null)}
        onDelete={() => remove(`/api/projects/${selectedProject.id}`, 'Project deleted')}
      />
      <DeleteDialog
        label="organization"
        name={selectedOrg.name}
        isOpen={deleting === 'organization'}
        onClose={() => setDeleting(null)}
        onDelete={() => remove(`/api/organizations/${selectedOrg.id}`, 'Organization deleted')}
      />
    </div>
  );
}
