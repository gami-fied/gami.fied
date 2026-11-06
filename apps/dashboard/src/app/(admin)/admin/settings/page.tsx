'use client';

import { SmtpSettingsView } from '@/components/features/settings/smtp-settings-view';
import { PlatformSettingsForm } from '@/components/features/settings/platform-settings-form';
import { Mail, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/ui/page-header';

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState<'smtp' | 'platform'>('smtp');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Server Settings"
        description="Email, features and integrations for this server."
      />

      <div className="page-toolbar flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('smtp')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === 'smtp'
              ? 'border-danger-500 text-danger-400 bg-danger-950/20'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Mail className="w-4 h-4" />
          SMTP Server Configuration
        </button>
        <button
          onClick={() => setActiveTab('platform')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold border-b-2 transition ${
            activeTab === 'platform'
              ? 'border-danger-500 text-danger-400 bg-danger-950/20'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Platform Settings
        </button>
      </div>

      {activeTab === 'smtp' && <SmtpSettingsView />}
      {activeTab === 'platform' && <PlatformSettingsForm />}
    </div>
  );
}
