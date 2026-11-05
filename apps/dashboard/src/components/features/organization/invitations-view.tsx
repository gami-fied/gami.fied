'use client';

import { formatDate } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
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
import type { OrganizationInvitationRecord } from '@gami.fied/sdk';

export function InvitationsView() {
  const toast = useToast();
  const confirmAction = useConfirm();
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
      const res = await apiFetch(`/api/organizations/${selectedOrg.id}/invitations`);
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
      const res = await apiFetch(`/api/organizations/${selectedOrg.id}/invitations/${invId}/resend`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.invitationUrl) {
          navigator.clipboard.writeText(data.invitationUrl);
          toast.success(`Invitation resent! New acceptance URL copied to clipboard: ${data.invitationUrl}`);
        } else {
          toast.success('Invitation resent successfully!');
        }
        await fetchInvitations();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Resend failed: ${err.message || 'Error resending invitation'}`);
      }
    } catch {
      toast.error('Network error resending invitation');
    } finally {
      setResendingId(null);
    }
  };

  const handleRevoke = async (invId: string, email: string) => {
    if (!selectedOrg) return;
    if (!await confirmAction({ message: `Are you sure you want to revoke the invitation for ${email}?` })) return;

    setRevokingId(invId);
    try {
      const res = await apiFetch(`/api/organizations/${selectedOrg.id}/invitations/${invId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchInvitations();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Revoke failed: ${err.message || 'Error revoking invitation'}`);
      }
    } catch {
      toast.error('Network error revoking invitation');
    } finally {
      setRevokingId(null);
    }
  };

  if (!selectedOrg) {
    return (
      <div className="p-8 text-center text-zinc-400 text-xs">
        Please select an organization to view invitations.
      </div>
    );
  }

  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg.role || 'member');

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-brand-400" />
            Pending Organization Invitations
          </h1>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
            <span>
              Track and manage team invitations sent for{' '}
              <span className="text-brand-400 font-semibold">{selectedOrg.name}</span>.
            </span>
            {!isAdminOrOwner && (
              <span className="text-xs font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 shrink-0 flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-400" /> READ-ONLY MEMBER
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
                ? 'bg-brand-500 hover:bg-brand-600 text-on-accent'
                : 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-400 border-zinc-700'
            }`}
          >
            <UserPlus className="w-4 h-4 mr-1" />
            Invite Member
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Invitations Table */}
      <Card className="bg-zinc-950 border-zinc-800">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
            Loading invitations...
          </div>
        ) : invitations.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No pending or historical invitations found for this organization.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs">
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
                          <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          {inv.email}
                        </div>
                      </td>

                      <td className="p-3">
                        <span className="text-xs font-bold px-2 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-300">
                          {inv.role}
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 border flex items-center gap-1 w-fit ${
                            inv.status === 'accepted'
                              ? 'border-success-800 bg-success-950/60 text-success-400'
                              : isPending && !isExpired
                              ? 'border-warning-800 bg-warning-950/60 text-warning-400'
                              : 'border-danger-950 bg-danger-950/40 text-danger-400'
                          }`}
                        >
                          {inv.status === 'accepted' ? (
                            <CheckCircle2 className="w-3 h-3 text-success-400" />
                          ) : isPending && !isExpired ? (
                            <Clock className="w-3 h-3 text-warning-400" />
                          ) : (
                            <XCircle className="w-3 h-3 text-danger-400" />
                          )}
                          {isPending && isExpired ? 'expired' : inv.status}
                        </span>
                      </td>

                      <td className="p-3 text-zinc-400">
                        {inv.inviterName || inv.inviterEmail || 'Administrator'}
                      </td>

                      <td className="p-3 text-zinc-400">
                        {formatDate(inv.expiresAt)}
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
                                  ? 'hover:bg-zinc-900 text-brand-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-400 border-zinc-900'
                              }`}
                            >
                              <Send className="w-3 h-3 mr-1 text-brand-400" /> Resend
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
                                  ? 'border-danger-950 hover:bg-danger-950/40 text-danger-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-400 border-zinc-900'
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
