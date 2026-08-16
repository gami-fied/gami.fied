'use client';

import { useEffect, useState } from 'react';
import {
  UserPlus,
  Mail,
  Send,
  Trash2,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
} from 'lucide-react';
import { useDashboard } from '../context/dashboard-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InviteModal } from './invite-modal';
import type { OrganizationInvitationRecord } from '@gami/sdk';

export function InvitationsView() {
  const { selectedOrg } = useDashboard();
  const [invitations, setInvitations] = useState<OrganizationInvitationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (selectedOrg) {
      fetchInvitations();
    }
  }, [selectedOrg]);

  const fetchInvitations = async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/invitations`);
      if (res.ok) {
        const data = await res.json();
        setInvitations(data.invitations || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to load invitations');
      }
    } catch {
      setError('Network error loading invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (invId: string) => {
    if (!selectedOrg) return;
    setResendingId(invId);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/invitations/${invId}/resend`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.invitationUrl) {
          navigator.clipboard.writeText(data.invitationUrl);
          alert(`Invitation resent! New acceptance URL copied to clipboard: ${data.invitationUrl}`);
        } else {
          alert('Invitation resent successfully!');
        }
        await fetchInvitations();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Resend failed: ${err.message || 'Error resending invitation'}`);
      }
    } catch {
      alert('Network error resending invitation');
    } finally {
      setResendingId(null);
    }
  };

  const handleRevoke = async (invId: string, email: string) => {
    if (!selectedOrg) return;
    if (!confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;

    setRevokingId(invId);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/invitations/${invId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchInvitations();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Revoke failed: ${err.message || 'Error revoking invitation'}`);
      }
    } catch {
      alert('Network error revoking invitation');
    } finally {
      setRevokingId(null);
    }
  };

  if (!selectedOrg) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono text-xs">
        Please select an organization to view invitations.
      </div>
    );
  }

  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg.role || 'member');

  return (
    <div className="space-y-6 font-mono">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-orange-400" />
            Pending Organization Invitations
          </h1>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
            <span>
              Track and manage team invitations sent for{' '}
              <span className="text-orange-400 font-semibold">{selectedOrg.name}</span>.
            </span>
            {!isAdminOrOwner && (
              <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 shrink-0 flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-500" /> READ-ONLY MEMBER
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={fetchInvitations} className="h-9 border-zinc-800 text-zinc-400">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>

          <Button
            variant="primary"
            size="sm"
            disabled={!isAdminOrOwner}
            title={!isAdminOrOwner ? 'Requires Admin or Owner role to invite members' : undefined}
            onClick={() => setIsInviteOpen(true)}
            className={`font-medium h-9 ${
              isAdminOrOwner
                ? 'bg-orange-500 hover:bg-orange-600 text-white'
                : 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700'
            }`}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Invite Member
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Invitations Table */}
      <Card className="bg-zinc-950 border-zinc-800">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
            Loading invitations...
          </div>
        ) : invitations.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            No pending or historical invitations found for this organization.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="p-3">Recipient Email</th>
                  <th className="p-3">Assigned Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Invited By</th>
                  <th className="p-3">Expiration</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {invitations.map((inv) => {
                  const isPending = inv.status === 'pending';
                  const isExpired = new Date() > new Date(inv.expiresAt);

                  return (
                    <tr key={inv.id} className="hover:bg-zinc-900/40 transition">
                      <td className="p-3">
                        <div className="flex items-center gap-2 font-bold text-zinc-100">
                          <Mail className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                          {inv.email}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-300">
                          {inv.role}
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 border flex items-center gap-1 w-fit ${
                            inv.status === 'accepted'
                              ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400'
                              : isPending && !isExpired
                              ? 'border-amber-800 bg-amber-950/60 text-amber-400'
                              : 'border-rose-950 bg-rose-950/40 text-rose-400'
                          }`}
                        >
                          {inv.status === 'accepted' ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          ) : isPending && !isExpired ? (
                            <Clock className="w-3 h-3 text-amber-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-rose-400" />
                          )}
                          {isPending && isExpired ? 'expired' : inv.status}
                        </span>
                      </td>

                      <td className="p-3 text-zinc-400">
                        {inv.inviterName || inv.inviterEmail || 'Administrator'}
                      </td>

                      <td className="p-3 text-zinc-400">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </td>

                      <td className="p-3 text-right">
                        {isPending && (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!isAdminOrOwner}
                              title={!isAdminOrOwner ? 'Requires Admin or Owner role to resend' : 'Resend invitation'}
                              isLoading={resendingId === inv.id}
                              onClick={() => {
                                if (!isAdminOrOwner) return;
                                handleResend(inv.id);
                              }}
                              className={`h-7 px-2 border-zinc-800 text-[11px] ${
                                isAdminOrOwner
                                  ? 'hover:bg-zinc-900 text-orange-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                              }`}
                            >
                              <Send className="w-3 h-3 mr-1 text-orange-400" /> Resend
                            </Button>

                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!isAdminOrOwner}
                              title={!isAdminOrOwner ? 'Requires Admin or Owner role to revoke' : 'Revoke invitation'}
                              isLoading={revokingId === inv.id}
                              onClick={() => {
                                if (!isAdminOrOwner) return;
                                handleRevoke(inv.id, inv.email);
                              }}
                              className={`h-7 px-2 text-[11px] ${
                                isAdminOrOwner
                                  ? 'border-rose-950 hover:bg-rose-950/40 text-rose-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                              }`}
                            >
                              <Trash2 className="w-3 h-3" /> Revoke
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onSuccess={fetchInvitations}
      />
    </div>
  );
}
