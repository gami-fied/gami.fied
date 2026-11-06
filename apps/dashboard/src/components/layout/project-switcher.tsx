'use client';

import React, { useState } from 'react';
import { useDashboard } from '../features/context/dashboard-context';
import { FolderGit2 } from 'lucide-react';
import { Dropdown } from '../ui/dropdown';
import { usePermissions } from '@/hooks/use-permissions';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export function ProjectSwitcher() {
  const { selectedOrg, projects, selectedProject, setSelectedProject, createProject } =
    useDashboard();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isAdminOrOwner } = usePermissions();

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setLoading(true);
    setError(null);

    try {
      await createProject(selectedOrg.id, name, slug);
      setName('');
      setSlug('');
      setIsModalOpen(false);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const dropdownOptions = projects.map((prj) => ({
    value: prj.id,
    label: prj.name,
    sublabel: prj.slug,
    icon: <FolderGit2 className="w-3.5 h-3.5 text-zinc-400 shrink-0" />,
  }));

  return (
    <>
      <div className="w-44 sm:w-52">
        <Dropdown
          options={dropdownOptions}
          value={selectedProject?.id || null}
          onChange={(val) => {
            const prj = projects.find((p) => p.id === val);
            if (prj) setSelectedProject(prj);
          }}
          placeholder={projects.length === 0 ? 'No projects yet' : 'Select a project'}
          actionLabel={isAdminOrOwner ? '+ New project' : undefined}
          onActionClick={isAdminOrOwner ? () => setIsModalOpen(true) : undefined}
          disabled={!selectedOrg || projects.length === 0}
        />
      </div>

      <Dialog
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setError(null);
        }}
        title="Create Project"
        description="Add a new project inside the current organization."
      >
        <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
              <span className="text-danger-400 font-bold">⚠</span>
              <span>{error}</span>
            </div>
          )}
          <Input
            label="Project Name *"
            placeholder="e.g. Mobile App Production"
            value={name}
            onChange={(e) => {
              const newName = e.target.value;
              setName(newName);
              setSlug(newName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
            }}
            required
          />
          <Input
            label="Project Slug *"
            placeholder="e.g. mobile-app-prod"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, ''))}
            required
            helperText="Unique project slug within this organization."
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
              className="bg-brand-500 hover:bg-brand-600 text-on-accent font-medium"
            >
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
