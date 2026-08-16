'use client';

import React, { useEffect, useState } from 'react';
import { Lock, Save, ShieldAlert, CheckCircle, Mail, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';

export default function AdminSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [smtpConfigured, setSmtpConfigured] = useState(false);

  const [form, setForm] = useState({
    requireEmailOtpVerification: false,
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

  const fetchSecurityConfig = async () => {
    setLoading(true);
    try {
      const [secRes, smtpRes] = await Promise.all([
        fetch('/api/admin/security'),
        fetch('/api/admin/smtp'),
      ]);

      if (secRes.ok) {
        const data = await secRes.json();
        if (data.security && data.security.configured) {
          setForm((prev) => ({
            ...prev,
            ...data.security,
          }));
        }
      }

      if (smtpRes.ok) {
        const smtpData = await smtpRes.json();
        setSmtpConfigured(Boolean(smtpData.configured));
      }
    } catch {
      setError('Failed to fetch security settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    // Prerequisite check for OTP verification
    if (form.requireEmailOtpVerification && !smtpConfigured) {
      setError('SMTP server must be configured before enabling Email OTP Verification.');
      setSaving(false);
      return;
    }

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

  const otpChecklistItems: ChecklistItem<string>[] = [
    {
      value: 'require_email_otp',
      label: 'Enforce Email OTP Verification on Account Registration',
      description:
        'Requires new users to verify a 6-digit numeric OTP sent via SMTP email before accessing the platform.',
      badge: smtpConfigured ? 'SMTP Ready' : 'SMTP Required',
      disabled: !smtpConfigured,
    },
  ];

  const handleOtpToggle = (selected: string[]) => {
    if (!smtpConfigured && selected.includes('require_email_otp')) {
      setError('SMTP server must be configured before enabling Email OTP Verification.');
      return;
    }
    setForm((prev) => ({
      ...prev,
      requireEmailOtpVerification: selected.includes('require_email_otp'),
    }));
  };

  return (
    <div className="space-y-6 font-mono max-w-4xl text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-rose-400" />
          Platform Security &amp; Authentication Policies
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure server-wide session expiration, Email OTP verification, rate limits, and password policies.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Loading security policies...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Email OTP Verification Toggle using Custom Checklist */}
          <Card className="border-rose-900/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-cyan-400" />
                  <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                    1. Account Registration Email OTP Verification
                  </CardTitle>
                </div>
                <Badge variant={smtpConfigured ? 'cyan' : 'amber'}>
                  {smtpConfigured ? 'SMTP Configured' : 'SMTP Not Configured'}
                </Badge>
              </div>
              <CardDescription>
                Force newly registered users to enter a 6-digit numeric OTP code sent to their email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Checklist
                title="EMAIL OTP VERIFICATION POLICY"
                items={otpChecklistItems}
                selectedValues={form.requireEmailOtpVerification ? ['require_email_otp'] : []}
                onChange={handleOtpToggle}
                showSelectAll={false}
                showSearch={false}
              />

              {!smtpConfigured && (
                <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Notice: An active SMTP server must be configured under Platform Admin Settings (`/admin/settings`) before enabling Email OTP Verification.
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 2: Session & Lifetime Policies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                2. Session &amp; Inactivity Lifetime Policies
              </CardTitle>
              <CardDescription>Configure session timeout and max lifetime limits.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                    Session Inactivity Timeout (minutes)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="10080"
                    value={form.sessionExpirationMinutes}
                    onChange={(e) =>
                      setForm({ ...form, sessionExpirationMinutes: parseInt(e.target.value, 10) || 1440 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                    Max Absolute Session Lifetime (hours)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="720"
                    value={form.maxSessionLifetimeHours}
                    onChange={(e) =>
                      setForm({ ...form, maxSessionLifetimeHours: parseInt(e.target.value, 10) || 168 })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Authentication Lockout & Protection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
                3. Brute-Force Lockout &amp; Rate Limits
              </CardTitle>
              <CardDescription>Set attempt limits and lockout durations.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                    Max Failed Login Attempts
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={form.maxFailedLoginAttempts}
                    onChange={(e) =>
                      setForm({ ...form, maxFailedLoginAttempts: parseInt(e.target.value, 10) || 5 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                    Lockout Duration (minutes)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="1440"
                    value={form.lockoutDurationMinutes}
                    onChange={(e) =>
                      setForm({ ...form, lockoutDurationMinutes: parseInt(e.target.value, 10) || 15 })
                    }
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                    Login Rate Limit (req/min)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    value={form.loginRateLimit}
                    onChange={(e) =>
                      setForm({ ...form, loginRateLimit: parseInt(e.target.value, 10) || 60 })
                    }
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={saving}
              variant="orange"
              className="flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Enforcing Policies...' : 'Save & Enforce Security Policies'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
