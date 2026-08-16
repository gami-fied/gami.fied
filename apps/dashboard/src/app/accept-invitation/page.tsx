'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Building2, CheckCircle2, AlertTriangle, UserPlus, ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

function AcceptInvitationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [accepting, setAccepting] = useState(false);

  // New Account Registration state if user is unauthenticated
  const [showRegister, setShowRegister] = useState(false);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [regLoading, setRegLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchInvitation();
    } else {
      setError('No invitation token provided in URL.');
      setLoading(false);
    }
  }, [token]);

  const fetchInvitation = async () => {
    try {
      const res = await fetch(`/api/invitations/${token}`);
      if (res.ok) {
        const data = await res.json();
        setInvitation(data);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Invitation is invalid or has expired.');
      }
    } catch {
      setError('Failed to query invitation status.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);

    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else if (res.status === 401) {
        // Not authenticated -> prompt account creation / sign-in with invited email
        setShowRegister(true);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to accept invitation.');
      }
    } catch {
      setError('Network error accepting invitation.');
    } finally {
      setAccepting(false);
    }
  };

  const handleRegisterAndAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation || !token) return;
    setRegLoading(true);
    setError(null);

    try {
      // 1. Create account with invited email
      const regRes = await fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: invitation.email,
          password,
          name: name || 'Team Member',
        }),
      });

      if (!regRes.ok) {
        const regErr = await regRes.json().catch(() => ({}));
        setError(regErr.message || 'Failed to create user account. Email may already have an account.');
        setRegLoading(false);
        return;
      }

      // 2. Accept invitation automatically
      const acceptRes = await fetch(`/api/invitations/${token}/accept`, {
        method: 'POST',
      });

      if (acceptRes.ok) {
        setSuccess(true);
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        const accErr = await acceptRes.json().catch(() => ({}));
        setError(accErr.message || 'Account created, but error accepting invitation.');
      }
    } catch {
      setError('Error creating account and accepting invitation.');
    } finally {
      setRegLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    try {
      await fetch(`/api/invitations/${token}/decline`, { method: 'POST' });
      router.push('/login');
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono text-xs p-4">
        <Card className="w-full max-w-md p-6 bg-zinc-900 border-zinc-800 text-center space-y-3">
          <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent animate-spin mx-auto" />
          <p className="text-zinc-400">Verifying invitation token...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono text-xs p-4">
      <Card className="w-full max-w-2xl p-6 bg-zinc-900 border-zinc-800 space-y-5">
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-3">
          <Building2 className="w-5 h-5 text-orange-400 shrink-0" />
          <h1 className="text-base font-bold text-zinc-100 uppercase tracking-wider">
            Team Invitation
          </h1>
        </div>

        {error && (
          <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            {error}
          </div>
        )}

        {success ? (
          <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs space-y-2 text-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h3 className="font-bold text-sm text-zinc-100 uppercase">Invitation Accepted!</h3>
            <p className="text-zinc-400">You are now attached to {invitation?.organizationName}. Redirecting to dashboard...</p>
          </div>
        ) : invitation ? (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-950 border border-zinc-800 space-y-2">
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest block">Organization</span>
              <h2 className="text-lg font-bold text-orange-400">{invitation.organizationName}</h2>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-800 text-[11px]">
                <div>
                  <span className="text-zinc-500 block">Invited Email</span>
                  <span className="text-zinc-200 font-bold">{invitation.email}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block">Assigned Role</span>
                  <span className="text-orange-400 font-bold uppercase">{invitation.role}</span>
                </div>
              </div>
            </div>

            {showRegister ? (
              <form onSubmit={handleRegisterAndAccept} className="space-y-3 p-4 bg-zinc-950 border border-zinc-800">
                <p className="text-zinc-300 text-[11px]">
                  Create your Gami account to accept invitation for <span className="text-orange-400">{invitation.email}</span>:
                </p>
                <Input
                  label="Full Name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" size="sm" isLoading={regLoading} className="w-full bg-orange-500 hover:bg-orange-600">
                  <UserPlus className="w-4 h-4 mr-1" /> Create Account & Accept
                </Button>
              </form>
            ) : (
              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleDecline}
                  className="flex-1 border-zinc-800 text-zinc-400"
                >
                  Decline
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  isLoading={accepting}
                  onClick={handleAccept}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                >
                  Accept Invitation <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center font-mono text-xs">Loading invitation...</div>}>
      <AcceptInvitationContent />
    </Suspense>
  );
}
