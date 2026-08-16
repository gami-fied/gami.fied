'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shield, Server, Building2, Lock, Settings, History, KeyRound, Key, AlertTriangle, CheckCircle, Database } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [submittingBootstrap, setSubmittingBootstrap] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapSuccess, setBootstrapSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkAdminAccess();
  }, []);

  const checkAdminAccess = async () => {
    setCheckingAuth(true);
    try {
      const res = await fetch('/api/admin/system');
      if (res.ok) {
        setIsPlatformAdmin(true);
        setCanBootstrap(false);
      } else {
        setIsPlatformAdmin(false);
        // Check bootstrap status
        const statusRes = await fetch('/api/admin/bootstrap/status');
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setCanBootstrap(Boolean(statusData.canBootstrap));
        }
      }
    } catch {
      setIsPlatformAdmin(false);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleClaimBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingBootstrap(true);
    setBootstrapError(null);
    setBootstrapSuccess(null);

    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bootstrapSecret: bootstrapSecret.trim() }),
      });

      if (res.ok) {
        setBootstrapSuccess('Platform Administrator account successfully claimed! Refreshing access...');
        setTimeout(() => {
          checkAdminAccess();
        }, 1000);
      } else {
        const err = await res.json().catch(() => ({}));
        setBootstrapError(err.message || 'Failed to claim Platform Administrator role');
      }
    } catch {
      setBootstrapError('Network error attempting bootstrap claim');
    } finally {
      setSubmittingBootstrap(false);
    }
  };

  const navItems = [
    { name: 'Overview', href: '/admin', icon: Server },
    { name: 'Organizations', href: '/admin/organizations', icon: Building2 },
    { name: 'Security', href: '/admin/security', icon: Lock },
    { name: 'Server Settings', href: '/admin/settings', icon: Settings },
    { name: 'Storage & Cleanup', href: '/admin/storage', icon: Database },
    { name: 'Audit Logs', href: '/admin/audit-logs', icon: History },
    { name: 'Sessions', href: '/admin/sessions', icon: KeyRound },
  ];

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-mono flex items-center justify-center p-6">
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Verifying Platform Administrator authorization...
        </div>
      </div>
    );
  }

  // First-Time Setup / Claim Card when 0 Platform Admins exist
  if (!isPlatformAdmin && canBootstrap) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-mono flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
            <div className="w-10 h-10 bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 font-bold">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold uppercase text-white">First-Time Platform Setup</h1>
              <p className="text-xs text-zinc-400 mt-0.5">
                Zero Platform Administrators exist on this server installation.
              </p>
            </div>
          </div>

          {bootstrapError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              {bootstrapError}
            </div>
          )}

          {bootstrapSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              {bootstrapSuccess}
            </div>
          )}

          <form onSubmit={handleClaimBootstrap} className="space-y-4">
            <div>
              <label className="block text-xs uppercase font-bold text-zinc-300 mb-1">
                Server Bootstrap Secret
              </label>
              <input
                type="password"
                placeholder="Enter PLATFORM_BOOTSTRAP_SECRET"
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                required
                className="w-full bg-zinc-900 border border-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-rose-500 font-mono"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                This secret is configured in your server environment variables.
              </p>
            </div>

            <button
              type="submit"
              disabled={submittingBootstrap || !bootstrapSecret.trim()}
              className="w-full bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 py-2.5 text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
            >
              {submittingBootstrap ? 'Claiming Admin Role...' : 'Claim First Platform Admin Role'}
            </button>
          </form>

          <div className="pt-2 border-t border-zinc-900 text-center">
            <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300">
              ← Return to Project Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Access Denied Card when user is not a Platform Admin and 1+ admins exist
  if (!isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-black text-zinc-100 font-mono flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-zinc-950 border border-rose-900/60 p-6 space-y-4 text-center">
          <div className="w-12 h-12 bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 mx-auto">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-base font-bold uppercase text-white">Platform Admin Access Required</h1>
          <p className="text-xs text-zinc-400">
            This area is strictly reserved for Platform Administrators. Server administration privileges are separate from project owner roles.
          </p>
          <div className="pt-4 border-t border-zinc-900">
            <Link
              href="/dashboard"
              className="inline-block bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 px-4 py-2 text-xs uppercase font-bold transition"
            >
              ← Back to Project Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-mono flex flex-col">
      {/* Top Platform Admin Header */}
      <header className="border-b border-zinc-800 bg-zinc-950 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-rose-950/80 border border-rose-800 flex items-center justify-center text-rose-400 font-bold text-sm">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-bold uppercase tracking-wider text-white">
              Gami.Fied Platform Administration
            </span>
            <span className="ml-2.5 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 border border-rose-800 bg-rose-950/40 text-rose-400">
              Platform Admin Scope
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/dashboard"
            className="text-zinc-400 hover:text-zinc-200 uppercase tracking-wider border border-zinc-800 px-3 py-1 bg-zinc-900 transition"
          >
            ← Project Dashboard
          </Link>
        </div>
      </header>

      {/* Admin Navigation Bar */}
      <nav className="border-b border-zinc-800 bg-zinc-900/60 px-6 flex items-center gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs uppercase font-semibold tracking-wider border-b-2 transition ${
                isActive
                  ? 'border-rose-500 text-rose-400 bg-rose-950/20'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">{children}</main>
    </div>
  );
}
