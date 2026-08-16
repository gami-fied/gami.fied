'use client';

import React, { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Checklist } from '@/components/ui/checklist';
import { UserPlus, AlertTriangle, CheckCircle2, FolderGit2 } from 'lucide-react';
import { useDashboard } from '../context/dashboard-context';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function InviteModal({ isOpen, onClose, onSuccess }: InviteModalProps) {
  const { selectedOrg, projects } = useDashboard();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;

    if (!email || !email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          role,
          projectIds: selectedProjectIds,
        }),
      });

      if (res.ok) {
        setSuccessMsg(`Invitation successfully created and sent to ${email.trim()}`);
        setEmail('');
        setSelectedProjectIds([]);
        if (onSuccess) onSuccess();
        setTimeout(() => {
          setSuccessMsg(null);
          onClose();
        }, 1500);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to send invitation');
      }
    } catch {
      setError('Network error creating invitation');
    } finally {
      setLoading(false);
    }
  };

  const projectChecklistItems = projects.map((prj) => ({
    value: prj.id,
    label: prj.name,
    description: `Slug: ${prj.slug}`,
    badge: 'Project',
  }));

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Invite Team Member">
      <form onSubmit={handleSubmit} className="space-y-4 font-mono text-xs max-h-[75vh] overflow-y-auto pr-1">
        <p className="text-zinc-400 text-xs">
          Invite a developer or administrator to collaborate on organization{' '}
          <span className="text-orange-400 font-bold">{selectedOrg?.name}</span>.
        </p>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {error}
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            {successMsg}
          </div>
        )}

        <Input
          label="Member Email Address *"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@example.com"
          required
        />

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-zinc-300 tracking-tight">
            Assigned Role
          </label>
          <Dropdown
            options={[
              { value: 'member', label: 'Member', sublabel: 'Access assigned projects & read dashboard data' },
              { value: 'admin', label: 'Admin', sublabel: 'Manage members, invitations & projects' },
            ]}
            value={role}
            onChange={(val) => setRole(val as 'admin' | 'member')}
          />
        </div>

        {/* Initial Assigned Projects Checklist */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center justify-between">
            <label className="block text-[13px] font-medium text-zinc-300 tracking-tight flex items-center gap-1.5">
              <FolderGit2 className="w-3.5 h-3.5 text-orange-400" />
              Initial Assigned Projects ({selectedProjectIds.length}/{projects.length})
            </label>
          </div>
          <p className="text-[11px] text-zinc-500">
            Select initial projects this member will have access to. If none selected, the member will initially have access to no projects.
          </p>

          {projectChecklistItems.length === 0 ? (
            <div className="p-3 bg-zinc-900 border border-zinc-800 text-zinc-500 text-center text-[11px]">
              No projects created in this organization yet.
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto pr-1">
              <Checklist
                items={projectChecklistItems}
                selectedValues={selectedProjectIds}
                onChange={setSelectedProjectIds}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={loading} className="bg-orange-500 hover:bg-orange-600 text-white font-medium">
            <UserPlus className="w-4 h-4 mr-1" /> Send Invitation
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
