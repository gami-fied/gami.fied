'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { Lock, Save, CheckCircle, Mail, AlertTriangle } from 'lucide-react';
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
    maxSessionLifetimeHours: 168,
    loginRateLimit: 60,
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
        apiFetch('/api/admin/security'),
        apiFetch('/api/admin/smtp'),
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
      const res = await apiFetch('/api/admin/security', {
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
    <div className="space-y-6 max-w-4xl text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Lock className="w-5 h-5 text-danger-400" />
          Platform Security &amp; Authentication Policies
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure server-wide session expiration, Email OTP verification, rate limits, and password policies.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-success-950/40 border border-success-800 text-success-300 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-success-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-danger-500 border-t-transparent rounded-full animate-spin" />
          Loading security policies...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Email OTP Verification Toggle using Custom Checklist */}
          <Card className="border-danger-900/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-info-400" />
                  <CardTitle className="text-sm font-bold text-zinc-100">
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
                <div className="p-3 bg-warning-950/40 border border-warning-800 text-warning-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning-400 shrink-0" />
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
              <CardTitle className="text-sm font-bold text-zinc-100">
                2. Session Lifetime Policy
              </CardTitle>
              <CardDescription>Users sign in again after this long. Applies to new sessions.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="page-session-lifetime-hours" className="block text-xs text-zinc-400 font-bold mb-1">
                    Session Lifetime (hours)
                  </label>
                  <Input id="page-session-lifetime-hours"
                    type="number"
                    min="1"
                    max="720"
                    value={form.maxSessionLifetimeHours}
                    onChange={(e) =>
                      setForm({ ...form, maxSessionLifetimeHours: parseInt(e.target.value, 10) || 168 })
                    }
                  />
                </div>
                <div>
                  <label htmlFor="page-minimum-password-length" className="block text-xs text-zinc-400 font-bold mb-1">
                    Minimum Password Length
                  </label>
                  <Input id="page-minimum-password-length"
                    type="number"
                    min="6"
                    max="128"
                    value={form.passwordMinLength}
                    onChange={(e) =>
                      setForm({ ...form, passwordMinLength: parseInt(e.target.value, 10) || 8 })
                    }
                  />
                  <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={form.requireNumbers}
                      onChange={(e) => setForm({ ...form, requireNumbers: e.target.checked })}
                    />
                    Require a number
                  </label>
                  <label className="mt-1 flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={form.requireSpecialChars}
                      onChange={(e) => setForm({ ...form, requireSpecialChars: e.target.checked })}
                    />
                    Require a special character
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Authentication Lockout & Protection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-100">
                3. Brute-Force Lockout &amp; Rate Limits
              </CardTitle>
              <CardDescription>Set attempt limits and lockout durations.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="page-max-failed-login-attempts" className="block text-xs text-zinc-400 font-bold mb-1">
                    Max Failed Login Attempts
                  </label>
                  <Input id="page-max-failed-login-attempts"
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
                  <label htmlFor="page-lockout-duration-minutes" className="block text-xs text-zinc-400 font-bold mb-1">
                    Lockout Duration (minutes)
                  </label>
                  <Input id="page-lockout-duration-minutes"
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
                  <label htmlFor="page-login-rate-limit-req-min" className="block text-xs text-zinc-400 font-bold mb-1">
                    Login Rate Limit (req/min)
                  </label>
                  <Input id="page-login-rate-limit-req-min"
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
