'use client';

import { apiFetch } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/confirm';
import { authClient } from '@/lib/auth-client';
import React, { useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';
import { User, Shield, CheckCircle2, Lock, Bell, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SETTINGS_COLUMNS } from '@/components/ui/card';

interface UserProfileData {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  isPlatformAdmin: boolean;
  subscribedToSystemEmails: boolean;
  createdAt: string;
  updatedAt: string;
}

export function ProfileView() {
  const [deletePassword, setDeletePassword] = useState('');
  const confirmAction = useConfirm();

  const handleDeleteAccount = async () => {
    const confirmed = await confirmAction({
      title: 'Delete your account?',
      message: "This can't be undone.",
      confirmText: 'Delete Account',
    });
    if (!confirmed) return;

    const result = await authClient.deleteUser({ password: deletePassword });
    if (result.error) {
      setError(result.error.message || 'Could not delete your account');
      return;
    }
    window.location.href = '/login';
  };

  const { session } = useDashboard();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [name, setName] = useState('');
  const [image, setImage] = useState('');
  const [password, setPassword] = useState('');
  const [subscribedToSystemEmails, setSubscribedToSystemEmails] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchProfile = async () => {
    try {
      const res = await apiFetch('/api/user/profile');
      if (res.ok) {
        const data: UserProfileData = await res.json();
        setProfile(data);
        setName(data.name || '');
        setImage(data.image || '');
        setSubscribedToSystemEmails(data.subscribedToSystemEmails);
      } else {
        setError('Failed to load user profile');
      }
    } catch {
      setError('Network error loading user profile');
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          image: image || null,
          subscribedToSystemEmails,
          password: password || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccessMsg(data.message || 'Profile updated successfully');
        setPassword('');
        fetchProfile();
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to update profile');
      }
    } catch {
      setError('Network error saving profile settings');
    } finally {
      setSaving(false);
    }
  };

  // Checklist items for email subscriptions using custom Checklist UI component
  const subscriptionItems: ChecklistItem<string>[] = [
    {
      value: 'system_emails',
      label: 'System & Platform Notification Emails',
      description:
        'Receive non-critical platform updates, digest summaries, and operational email alerts.',
      badge: 'Optional',
    },
    {
      value: 'security_otp_emails',
      label: 'Security & Email OTP Verification Emails',
      description:
        'Mandatory transactional security events (Email OTP verification, login alerts, password resets).',
      badge: 'Mandatory',
      disabled: true, // Cannot be unsubscribed!
    },
  ];

  const selectedSubscriptions = [
    ...(subscribedToSystemEmails ? ['system_emails'] : []),
    'security_otp_emails', // Always selected
  ];

  const handleSubscriptionChange = (newSelected: string[]) => {
    setSubscribedToSystemEmails(newSelected.includes('system_emails'));
  };

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Header */}
      <PageHeader
        title="Your profile"
        description="Your details, password and email preferences."
        actions={
          <>
            {profile?.isPlatformAdmin && (
              <Badge variant="orange" className="shrink-0">
                <Shield className="w-3 h-3 mr-1" /> Platform Admin
              </Badge>
            )}
          </>
        }
      />

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-success-950/40 border border-success-800 text-success-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveProfile} className="space-y-6">
        <div className={SETTINGS_COLUMNS}>
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <User className="w-4 h-4 text-brand-400" />
                Personal Profile Credentials
              </CardTitle>
              <CardDescription>
                Update your display name, avatar, and security password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="profile-view-full-name"
                    className="block text-xs text-zinc-400 font-bold mb-1"
                  >
                    Full Name *
                  </label>
                  <Input
                    id="profile-view-full-name"
                    type="text"
                    required
                    placeholder="Your Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs text-zinc-400 font-bold mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <Input
                      type="email"
                      disabled
                      value={profile?.email || session?.user?.email || ''}
                      className="opacity-70 bg-zinc-950"
                    />
                    {profile?.emailVerified && (
                      <span className="absolute right-3 top-2.5 text-xs text-success-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="profile-view-avatar-image-url"
                    className="block text-xs text-zinc-400 font-bold mb-1"
                  >
                    Avatar Image URL
                  </label>
                  <Input
                    id="profile-view-avatar-image-url"
                    type="url"
                    placeholder="https://example.com/avatar.png"
                    value={image}
                    onChange={(e) => setImage(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="profile-view-new-password-optional"
                    className="block text-xs text-zinc-400 font-bold mb-1"
                  >
                    New Password (Optional)
                  </label>
                  <Input
                    id="profile-view-new-password-optional"
                    type="password"
                    placeholder="Leave blank to keep unchanged"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Subscription Preferences using Custom Checklist Component */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-info-400" />
                Email Notification Subscriptions
              </CardTitle>
              <CardDescription>
                Choose which platform email notifications you want to receive.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Custom Checklist UI Component */}
              <Checklist
                title="EMAIL SUBSCRIPTION PREFERENCES"
                items={subscriptionItems}
                selectedValues={selectedSubscriptions}
                onChange={handleSubscriptionChange}
                showSelectAll={false}
                showSearch={false}
              />

              <div className="p-3 bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 flex items-start gap-2">
                <Lock className="w-4 h-4 text-info-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white text-[11px] block">
                    Mandatory Security Guarantee
                  </span>
                  <p className="text-[11px] leading-relaxed text-zinc-400">
                    Email OTP Verification codes and security alert emails are critical
                    transactional security events. They are{' '}
                    <span className="text-info-400 font-bold">mandatory</span> and will NEVER be
                    disabled or unsubscribed, even if optional system email notifications are turned
                    off.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving} variant="orange">
            {saving ? 'Saving Changes...' : 'Save Profile Settings'}
          </Button>
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-zinc-100">Delete Account</CardTitle>
          <CardDescription>
            This permanently removes your account. Transfer or delete any organizations you own
            first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label htmlFor="delete-password" className="block text-sm text-zinc-300 mb-1">
            Enter your password to confirm
          </label>
          <div className="flex gap-3">
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
            />
            <Button
              type="button"
              variant="danger"
              disabled={!deletePassword}
              onClick={handleDeleteAccount}
              className="shrink-0 whitespace-nowrap"
            >
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
