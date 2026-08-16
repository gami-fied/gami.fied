'use client';

import { useEffect, useState } from 'react';
import { useSmtpConfig } from '@/hooks/use-smtp';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';
import { Mail, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

export function SmtpSettingsView() {
  const { status, loading, error, successMsg, saveConfig, sendTestEmail } = useSmtpConfig();

  const [host, setHost] = useState('');
  const [port, setPort] = useState(587);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('Gami.Fied Engine');
  const [secure, setSecure] = useState(false);

  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Synchronize local form state whenever status is fetched or updated from backend
  useEffect(() => {
    if (status) {
      setHost(status.host || '');
      setPort(status.port || 587);
      setUser(status.user || '');
      setFromEmail(status.fromEmail || '');
      setFromName(status.fromName || 'Gami.Fied Engine');
      setSecure(Boolean(status.secure));
    }
  }, [status]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveConfig({
      host,
      port: Number(port),
      user,
      password: password || undefined,
      fromEmail,
      fromName,
      secure,
    });
    setPassword('');
  };

  const handleSendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailAddress) return;
    setSendingTest(true);
    const ok = await sendTestEmail(testEmailAddress);
    setSendingTest(false);
    if (ok) {
      setIsTestModalOpen(false);
    }
  };

  const tlsChecklistItems: ChecklistItem<string>[] = [
    {
      value: 'enable_tls',
      label: 'Enable TLS / Implicit SSL Connection',
      description: 'Encrypt SMTP socket transport (Required for Port 465, optional for Port 587 STARTTLS).',
      badge: secure ? 'TLS Active' : 'STARTTLS / Plain',
    },
  ];

  return (
    <div className="space-y-6 font-mono text-zinc-100 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-cyan-400" />
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">Server SMTP &amp; Email Settings</h1>
        </div>
        <p className="text-xs text-zinc-400">
          Configure server-wide SMTP email delivery settings for Gami notifications. Secrets encrypted at rest.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-cyan-950/40 border border-cyan-800 text-cyan-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* SMTP Connection Status Card */}
      <Card>
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">SMTP Server Status</div>
            <div className="flex items-center gap-2">
              <Badge variant={status?.configured ? 'cyan' : 'amber'}>
                {status?.configured ? 'SMTP Configured' : 'SMTP Not Configured'}
              </Badge>
              {status?.passwordConfigured && (
                <span className="text-[10px] text-zinc-400 border border-zinc-800 bg-zinc-900 px-2 py-0.5">
                  🔒 Password Encrypted
                </span>
              )}
            </div>
            {status?.updatedAt && (
              <div className="text-[11px] text-zinc-500">
                Last updated: {formatRelativeTime(status.updatedAt)}
              </div>
            )}
          </div>

          <Button
            type="button"
            onClick={() => setIsTestModalOpen(true)}
            disabled={!status?.configured}
            variant="cyan"
            className="shrink-0 flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            Send Test Email
          </Button>
        </CardContent>
      </Card>

      {/* SMTP Configuration Form */}
      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wide text-white">
              SMTP Server Credentials
            </CardTitle>
            <CardDescription>Configure SMTP mail server host, port, credentials, and sender headers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  SMTP Host *
                </label>
                <Input
                  type="text"
                  required
                  placeholder="e.g. smtp.mailtrap.io or smtp.gmail.com"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  SMTP Port *
                </label>
                <Input
                  type="number"
                  required
                  placeholder="587 or 465"
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  SMTP Username
                </label>
                <Input
                  type="text"
                  placeholder="Username or API Key ID"
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  SMTP Password / Secret
                </label>
                <Input
                  type="password"
                  placeholder={status?.passwordConfigured ? '•••••••••••• (Leave blank to keep unchanged)' : 'Enter SMTP password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  Sender Email Address (From Email) *
                </label>
                <Input
                  type="email"
                  required
                  placeholder="e.g. notifications@mycompany.com"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  Sender Name (From Name)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Gami Engine"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                />
              </div>
            </div>

            {/* Custom Checklist UI Component for TLS Toggle */}
            <div className="pt-2">
              <Checklist
                title="TRANSPORT SECURITY POLICY"
                items={tlsChecklistItems}
                selectedValues={secure ? ['enable_tls'] : []}
                onChange={(selected) => setSecure(selected.includes('enable_tls'))}
                showSelectAll={false}
                showSearch={false}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={loading}
            variant="cyan"
            className="px-6"
          >
            {loading ? 'Saving Configuration...' : 'Save SMTP Configuration'}
          </Button>
        </div>
      </form>

      {/* Test Email Modal */}
      {isTestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 font-mono">
          <div className="w-full max-w-md border border-zinc-700 bg-zinc-950 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-white tracking-wide">
                Send Test Email
              </h3>
              <button
                type="button"
                onClick={() => setIsTestModalOpen(false)}
                className="text-zinc-500 hover:text-white text-xs uppercase border border-zinc-800 px-2 py-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSendTest} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
                  Recipient Email Address *
                </label>
                <Input
                  type="email"
                  required
                  placeholder="admin@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={sendingTest || !testEmailAddress}
                  variant="cyan"
                >
                  {sendingTest ? 'Sending...' : 'Send Test Email'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
