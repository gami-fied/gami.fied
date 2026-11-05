'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

interface Field {
  key: string;
  label: string;
  help?: string;
  type: 'boolean' | 'number';
}

interface Section {
  category: string;
  title: string;
  description: string;
  fields: Field[];
}

const toggle = (key: string, label: string, help?: string): Field => ({
  key,
  label,
  help,
  type: 'boolean',
});
const number = (key: string, label: string, help?: string): Field => ({
  key,
  label,
  help,
  type: 'number',
});

const SECTIONS: Section[] = [
  {
    category: 'registration',
    title: 'Registration',
    description: 'Who can join, and what they can create.',
    fields: [
      toggle('allowPublicRegistration', 'Allow public sign-up', 'Invited people can always join.'),
      toggle('allowOrgCreation', 'Allow anyone to create organizations'),
      toggle('allowApiKeyCreation', 'Allow API key creation'),
      toggle('allowWebhookCreation', 'Allow webhook creation'),
      toggle('allowGlobalEmailNotifications', 'Allow notification emails'),
    ],
  },
  {
    category: 'rate_limits',
    title: 'Rate limits',
    description: 'Requests allowed in each time window.',
    fields: [
      number('perIpLimit', 'Requests per IP address'),
      number('perProjectLimit', 'Events per project'),
      number('windowMs', 'Window length (milliseconds)'),
    ],
  },
  {
    category: 'notifications',
    title: 'Notifications',
    description: 'In-app and email notifications.',
    fields: [
      toggle('enabled', 'Enable notifications'),
      toggle('defaultEmailNotifications', 'Send email unless a user turns it off'),
      number('maxDailyEmailsPerUser', 'Daily emails per user'),
      number('retryAttempts', 'Email retries'),
    ],
  },
  {
    category: 'webhooks',
    title: 'Webhooks',
    description: 'Limits for outgoing webhooks.',
    fields: [
      toggle('enabled', 'Enable webhooks'),
      number('maxWebhooksPerProject', 'Active endpoints per project'),
      number('defaultTimeoutMs', 'Timeout (milliseconds)'),
      number('maxRetryAttempts', 'Delivery retries'),
    ],
  },
  {
    category: 'integrations',
    title: 'Integrations',
    description: 'External channels.',
    fields: [toggle('enabled', 'Enable integrations'), toggle('allowDiscordIntegration', 'Allow Discord')],
  },
  {
    category: 'retention',
    title: 'Retention and backups',
    description: 'A value of 0 keeps data forever. Old data is removed every 6 hours.',
    fields: [
      number('outboxDays', 'Keep finished deliveries (days)'),
      number('ruleExecutionDays', 'Keep rule run records (days)'),
      number('notificationDays', 'Keep notifications (days)'),
      number('eventDays', 'Keep events (days)'),
      number('backupIntervalHours', 'Hours between scheduled backups', '0 turns them off.'),
      number('backupKeepCount', 'Scheduled backups to keep'),
    ],
  },
];

type Values = Record<string, unknown>;

function SectionCard({ section, initial }: { section: Section; initial: Values }) {
  const toast = useToast();
  const [values, setValues] = useState<Values>(initial);
  const [saving, setSaving] = useState(false);

  useEffect(() => setValues(initial), [initial]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const payload = Object.fromEntries(section.fields.map((f) => [f.key, values[f.key]]));
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: section.category, payload }),
    }).catch(() => null);
    setSaving(false);

    if (res?.ok) {
      toast.success(`${section.title} saved`);
    } else {
      const data = await res?.json().catch(() => null);
      toast.error('Could not save', data?.message ?? 'Check your connection and try again.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{section.title}</CardTitle>
        <CardDescription>{section.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          {section.fields.map((field) => {
            const id = `${section.category}-${field.key}`;
            if (field.type === 'boolean') {
              return (
                <label key={id} htmlFor={id} className="flex items-start gap-3 text-sm text-zinc-200">
                  <input
                    id={id}
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(values[field.key])}
                    onChange={(e) => setValues({ ...values, [field.key]: e.target.checked })}
                  />
                  <span>
                    {field.label}
                    {field.help && <span className="block text-xs text-zinc-400">{field.help}</span>}
                  </span>
                </label>
              );
            }
            return (
              <div key={id}>
                <label htmlFor={id} className="block text-sm text-zinc-300 mb-1">
                  {field.label}
                </label>
                <Input
                  id={id}
                  type="number"
                  min={0}
                  value={String(values[field.key] ?? '')}
                  onChange={(e) => setValues({ ...values, [field.key]: Number(e.target.value) })}
                />
                {field.help && <p className="text-xs text-zinc-400 mt-1">{field.help}</p>}
              </div>
            );
          })}
          <Button type="submit" isLoading={saving}>
            Save {section.title.toLowerCase()}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlatformSettingsForm() {
  const [configurations, setConfigurations] = useState<Record<string, Values> | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    const res = await fetch('/api/admin/config').catch(() => null);
    if (res?.ok) {
      setConfigurations((await res.json()).configurations);
    } else {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <div role="alert" className="border border-rose-800 p-4 text-sm text-rose-300">
        Settings couldn&apos;t load.{' '}
        <button className="underline" onClick={load}>
          Try again
        </button>
      </div>
    );
  }
  if (!configurations) return <TableSkeleton rows={6} />;

  return (
    <div className="space-y-6 max-w-2xl">
      {SECTIONS.map((section) => (
        <SectionCard
          key={section.category}
          section={section}
          initial={configurations[section.category] ?? {}}
        />
      ))}
    </div>
  );
}
