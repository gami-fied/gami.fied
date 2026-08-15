'use client';

import React, { useState } from 'react';
import { useDashboard } from '../features/context/dashboard-context';
import { FolderGit2 } from 'lucide-react';
import { Dropdown } from '../ui/dropdown';
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
    icon: <FolderGit2 className="w-3.5 h-3.5 text-zinc-400" />,
  }));

  return (
    <>
      <div className="w-48 sm:w-56">
        <Dropdown
          options={dropdownOptions}
          value={selectedProject?.id || null}
          onChange={(val) => {
            const prj = projects.find((p) => p.id === val);
            if (prj) setSelectedProject(prj);
          }}
          placeholder="Select Project"
          actionLabel="+ Create New Project"
          onActionClick={() => setIsModalOpen(true)}
          disabled={!selectedOrg}
        />
      </div>

      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Project"
        description="Add a new project inside the current organization."
      >
        <form onSubmit={handleCreateProject} className="space-y-4">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
              {error}
            </div>
          )}
          <Input
            label="Project Name"
            placeholder="e.g. Mobile App Production"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
            }}
            required
          />
          <Input
            label="Project Slug"
            placeholder="e.g. mobile-app-prod"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={loading}>
              Create Project
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
