'use client';

import { useState } from 'react';
import { useSmtpConfig } from '@/hooks/use-smtp';
import { formatRelativeTime } from '@/hooks/use-relative-time';

export function SmtpSettingsView() {
  const { status, loading, error, successMsg, saveConfig, sendTestEmail } = useSmtpConfig();

  const [host, setHost] = useState(status?.host || '');
  const [port, setPort] = useState(status?.port || 587);
  const [user, setUser] = useState(status?.user || '');
  const [password, setPassword] = useState('');
  const [fromEmail, setFromEmail] = useState(status?.fromEmail || '');
  const [fromName, setFromName] = useState(status?.fromName || 'Gami Engine');
  const [secure, setSecure] = useState(status?.secure || false);

  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  // Sync state when status finishes loading initial values
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

  return (
    <div className="space-y-6 font-mono text-zinc-100 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold tracking-tight text-white uppercase">Server SMTP &amp; Email Settings</h1>
        <p className="text-xs text-zinc-400">
          Configure server-wide SMTP email delivery settings for Gami notifications. Secrets encrypted at rest.
        </p>
      </div>

      {error && (
        <div className="border border-rose-800 bg-rose-950/40 p-4 text-xs text-rose-400 font-mono">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="border border-cyan-800 bg-cyan-950/40 p-4 text-xs text-cyan-400 font-mono">
          {successMsg}
        </div>
      )}

      {/* SMTP Connection Status Card */}
      <div className="border border-zinc-800 bg-zinc-950 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[10px] uppercase text-zinc-500 font-bold tracking-wider">SMTP Server Status</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 border px-2.5 py-0.5 text-xs uppercase font-bold tracking-wider ${
                status?.configured
                  ? 'border-cyan-700 bg-cyan-950/40 text-cyan-400'
                  : 'border-amber-700 bg-amber-950/40 text-amber-400'
              }`}
            >
              <span
                className={`w-2 h-2 ${status?.configured ? 'bg-cyan-400 animate-pulse' : 'bg-amber-400'}`}
              />
              {status?.configured ? 'SMTP Configured' : 'SMTP Not Configured'}
            </span>
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

        <button
          type="button"
          onClick={() => setIsTestModalOpen(true)}
          disabled={!status?.configured}
          className="shrink-0 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 border border-zinc-700 px-4 py-2 text-xs font-semibold uppercase tracking-wider transition"
        >
          ✉ Send Test Email
        </button>
      </div>

      {/* SMTP Configuration Form */}
      <form onSubmit={handleSave} className="border border-zinc-800 bg-zinc-950 p-6 space-y-4 font-mono">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white border-b border-zinc-800 pb-3">
          SMTP Server Credentials
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              SMTP Host *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. smtp.mailtrap.io or smtp.gmail.com"
              value={host || status?.host || ''}
              onChange={(e) => setHost(e.target.value)}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              SMTP Port *
            </label>
            <input
              type="number"
              required
              placeholder="587 or 465"
              value={port || status?.port || 587}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              SMTP Username
            </label>
            <input
              type="text"
              placeholder="Username or API Key ID"
              value={user || status?.user || ''}
              onChange={(e) => setUser(e.target.value)}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              SMTP Password / Secret
            </label>
            <input
              type="password"
              placeholder={status?.passwordConfigured ? '•••••••••••• (Leave blank to keep unchanged)' : 'Enter SMTP password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              Sender Email Address (From Email) *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. notifications@mycompany.com"
              value={fromEmail || status?.fromEmail || ''}
              onChange={(e) => setFromEmail(e.target.value)}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase text-zinc-400 font-bold mb-1">
              Sender Name (From Name)
            </label>
            <input
              type="text"
              placeholder="e.g. Gami Engine"
              value={fromName || status?.fromName || 'Gami Engine'}
              onChange={(e) => setFromName(e.target.value)}
              className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="smtp-secure"
            checked={secure}
            onChange={(e) => setSecure(e.target.checked)}
            className="w-4 h-4 rounded-none accent-cyan-500 bg-zinc-900 border-zinc-800"
          />
          <label htmlFor="smtp-secure" className="text-xs text-zinc-300">
            Enable TLS / Secure Connection (Required for Port 465)
          </label>
        </div>

        <div className="pt-4 border-t border-zinc-800 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-6 py-2 text-xs uppercase tracking-wider transition disabled:opacity-40"
          >
            {loading ? 'Saving...' : 'Save Configuration'}
          </button>
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
                <input
                  type="email"
                  required
                  placeholder="admin@example.com"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  className="w-full border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-xs uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingTest || !testEmailAddress}
                  className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold px-4 py-2 text-xs uppercase"
                >
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
