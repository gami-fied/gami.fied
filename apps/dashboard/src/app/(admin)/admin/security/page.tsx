'use client';

import { useEffect, useState } from 'react';
import { Lock, Save, ShieldAlert, CheckCircle } from 'lucide-react';

export default function AdminSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [form, setForm] = useState({
    sessionExpirationMinutes: 1440,
    maxSessionLifetimeHours: 168,
    loginRateLimit: 60,
    apiRateLimit: 1000,
    eventIngestionRateLimit: 10000,
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    passwordMinLength: 8,
    requireNumbers: false,
    requireSpecialChars: false,
  });

  useEffect(() => {
    fetchSecurityConfig();
  }, []);

  const fetchSecurityConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/security');
      if (res.ok) {
        const data = await res.json();
        if (data.security && data.security.configured) {
          setForm((prev) => ({
            ...prev,
            ...data.security,
          }));
        }
      }
    } catch {
      setError('Failed to fetch security settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/admin/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (res.ok) {
        setSuccess('Security configuration policies saved and enforced successfully');
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to save security configuration');
      }
    } catch {
      setError('Network error saving security settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-mono max-w-4xl">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-rose-400" />
          Platform Security & Authentication Policies
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure server-wide session expiration, brute-force lockout rules, rate limits, and password strength.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-400" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          {success}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Loading security policies...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 bg-zinc-950 border border-zinc-800 p-6">
          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase text-rose-400 tracking-wider border-b border-zinc-800 pb-2">
              1. Session & Lifetime Policies
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Session Inactivity Timeout (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="10080"
                  value={form.sessionExpirationMinutes}
                  onChange={(e) =>
                    setForm({ ...form, sessionExpirationMinutes: parseInt(e.target.value, 10) || 1440 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Max Absolute Session Lifetime (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={form.maxSessionLifetimeHours}
                  onChange={(e) =>
                    setForm({ ...form, maxSessionLifetimeHours: parseInt(e.target.value, 10) || 168 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase text-rose-400 tracking-wider border-b border-zinc-800 pb-2">
              2. Authentication Lockout & Protection
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Max Failed Login Attempts</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={form.maxFailedLoginAttempts}
                  onChange={(e) =>
                    setForm({ ...form, maxFailedLoginAttempts: parseInt(e.target.value, 10) || 5 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Lockout Duration (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={form.lockoutDurationMinutes}
                  onChange={(e) =>
                    setForm({ ...form, lockoutDurationMinutes: parseInt(e.target.value, 10) || 15 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="text-xs font-bold uppercase text-rose-400 tracking-wider border-b border-zinc-800 pb-2">
              3. Rate Limiting Limits
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Login Rate Limit (req/min)</label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={form.loginRateLimit}
                  onChange={(e) =>
                    setForm({ ...form, loginRateLimit: parseInt(e.target.value, 10) || 60 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">API Rate Limit (req/min)</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={form.apiRateLimit}
                  onChange={(e) =>
                    setForm({ ...form, apiRateLimit: parseInt(e.target.value, 10) || 1000 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Event Ingestion Limit (req/min)</label>
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={form.eventIngestionRateLimit}
                  onChange={(e) =>
                    setForm({ ...form, eventIngestionRateLimit: parseInt(e.target.value, 10) || 10000 })
                  }
                  className="w-full bg-zinc-900 border border-zinc-800 px-3 py-1.5 text-zinc-100 focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-zinc-800 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 px-5 py-2 text-xs uppercase font-bold transition disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving Security Policies...' : 'Save & Enforce Policies'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
