'use client';

import React, { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { Building2, Shield, Calendar, Mail, User, Layers, Plus, Trash2 } from 'lucide-react';
import { useDashboard } from '../context/dashboard-context';
import type { OrganizationMemberRecord } from '@gami/sdk';

interface MemberDetailsDrawerProps {
  member: OrganizationMemberRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function MemberDetailsDrawer({ member, isOpen, onClose, onRefresh }: MemberDetailsDrawerProps) {
  const { selectedOrg, projects } = useDashboard();
  const [assignedProjects, setAssignedProjects] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAddProject, setSelectedAddProject] = useState<string>('');

  useEffect(() => {
    if (member && selectedOrg) {
      fetchMemberDetails();
    }
  }, [member, selectedOrg]);

  const fetchMemberDetails = async () => {
    if (!member || !selectedOrg) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members/${member.userId}`);
      if (res.ok) {
        const data = await res.json();
        setAssignedProjects(data.projects || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleAddProject = async () => {
    if (!selectedAddProject || !member) return;
    try {
      const res = await fetch(`/api/projects/${selectedAddProject}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.userId }),
      });
      if (res.ok) {
        setSelectedAddProject('');
        await fetchMemberDetails();
        if (onRefresh) onRefresh();
      }
    } catch {}
  };

  const handleRemoveProject = async (projectId: string) => {
    if (!member) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${member.userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchMemberDetails();
        if (onRefresh) onRefresh();
      }
    } catch {}
  };

  if (!member) return null;

  const unassignedProjects = projects.filter(
    (p) => !assignedProjects.some((ap) => ap.id === p.id)
  );

  const unassignedProjectOptions: DropdownOption[] = unassignedProjects.map((p) => ({
    value: p.id,
    label: p.name,
    sublabel: `Slug: ${p.slug}`,
  }));

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Member Profile & Access">
      <div className="space-y-5 font-mono text-xs max-h-[80vh] overflow-y-auto pr-1">
        {/* Header Summary */}
        <div className="p-4 bg-zinc-950/80 border border-zinc-800 flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-orange-400">
            {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-100">{member.name || 'User'}</h3>
            <p className="text-xs text-zinc-400 flex items-center gap-1">
              <Mail className="w-3 h-3 text-zinc-500" /> {member.email}
            </p>
          </div>
        </div>

        {/* Account Info Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Organization Role</span>
            <span className="font-bold text-orange-400 uppercase text-xs block">
              {member.role}
            </span>
          </div>

          <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Joined Date</span>
            <span className="text-zinc-300 text-xs block">
              {new Date(member.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Project Access Management */}
        <div className="space-y-3 bg-zinc-950/60 border border-zinc-800 p-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-orange-400" />
              Assigned Projects ({assignedProjects.length})
            </span>
          </div>

          {['owner', 'admin'].includes(member.role) ? (
            <p className="text-[11px] text-emerald-400 p-2 bg-emerald-950/40 border border-emerald-900">
              ⚡ As an Organization {member.role.toUpperCase()}, this user automatically has full access to all projects.
            </p>
          ) : (
            <div className="space-y-3">
              {/* Add Project Selection with Custom Dropdown */}
              {unassignedProjects.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Dropdown
                      theme="orange"
                      placeholder="-- Select Project to Assign --"
                      options={unassignedProjectOptions}
                      value={selectedAddProject || null}
                      onChange={(val) => setSelectedAddProject(val)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleAddProject}
                    disabled={!selectedAddProject}
                    className="h-9 px-3 border-orange-800 text-orange-400 text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Access
                  </Button>
                </div>
              )}

              {/* Assigned Project List */}
              {assignedProjects.length === 0 ? (
                <p className="text-zinc-400 text-[11px] py-2 text-center border border-zinc-800 bg-zinc-900/60">
                  No project access assigned. Member cannot view or access any project in this organization.
                </p>
              ) : (
                <div className="space-y-2">
                  {assignedProjects.map((p) => (
                    <div
                      key={p.id}
                      className="p-2 bg-zinc-900 border border-zinc-800 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-zinc-200">{p.name}</span>
                        <span className="text-[10px] text-zinc-500 ml-2">({p.slug})</span>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => handleRemoveProject(p.id)}
                        className="h-6 px-1.5 border-rose-950 text-rose-400 text-[10px]"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-3 border-t border-zinc-800">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
