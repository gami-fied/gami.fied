'use client';

import { useEffect, useState } from 'react';
import { KeyRound, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ActiveSession {
  id: string;
  userId: string;
  expiresAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  userName: string;
  userEmail: string;
  isPlatformAdmin: boolean;
}

export default function AdminSessionsPage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingUserId, setRevokingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/sessions');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch active administrative sessions');
      }
    } catch {
      setError('Network error fetching active sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeAllUserSessions = async (userId: string, userName: string) => {
    if (
      !confirm(
        `Are you sure you want to revoke ALL active sessions for user "${userName}" (${userId})?\n\nThey will be immediately logged out.`
      )
    ) {
      return;
    }

    setRevokingUserId(userId);
    try {
      const res = await fetch('/api/admin/sessions/revoke-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId }),
      });

      if (res.ok) {
        await fetchSessions();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || 'Failed to revoke user sessions');
      }
    } catch {
      alert('Network error revoking user sessions');
    } finally {
      setRevokingUserId(null);
    }
  };

  return (
    <div className="space-y-6 font-mono text-zinc-100">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-rose-400" />
          Active Administrative &amp; User Sessions
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Monitor active user sessions, inspect IP addresses/user agents, and execute emergency session revocations.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Loading active session directory...
        </div>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role Scope</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">Created At</th>
                <th className="px-4 py-3">Expires At</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No active sessions found.
                  </td>
                </tr>
              ) : (
                sessions.map((sess) => (
                  <tr key={sess.id} className="hover:bg-zinc-900/40 transition">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{sess.userName}</div>
                      <div className="text-zinc-500 text-[10px]">{sess.userEmail}</div>
                    </td>
                    <td className="px-4 py-3">
                      {sess.isPlatformAdmin ? (
                        <Badge variant="rose">Platform Admin</Badge>
                      ) : (
                        <Badge variant="zinc">Standard User</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{sess.ipAddress || '127.0.0.1'}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(sess.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {new Date(sess.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        onClick={() => handleRevokeAllUserSessions(sess.userId, sess.userName)}
                        disabled={revokingUserId === sess.userId}
                        variant="rose"
                        size="sm"
                        className="flex items-center gap-1.5 ml-auto"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        {revokingUserId === sess.userId ? 'Revoking...' : 'Revoke All Sessions'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
