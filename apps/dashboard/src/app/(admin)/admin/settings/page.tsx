'use client';

import { SmtpSettingsView } from '@/components/features/settings/smtp-settings-view';
import { Settings, Mail, ShieldAlert, Sliders } from 'lucide-react';
import { useState } from 'react';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'smtp' | 'registration'>('smtp');

  return (
    <div className="space-y-6 font-mono">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-rose-400" />
          Global Server Settings
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Server-level SMTP mail delivery, feature toggles, and global integration rules.
        </p>
      </div>

      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('smtp')}
          className={`flex items-center gap-2 px-4 py-2 text-xs uppercase font-bold border-b-2 transition ${
            activeTab === 'smtp'
              ? 'border-rose-500 text-rose-400 bg-rose-950/20'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          SMTP Server Configuration
        </button>
      </div>

      {activeTab === 'smtp' && <SmtpSettingsView />}
    </div>
  );
}
