'use client';

import { apiFetch } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Languages, Plus, Trash2 } from 'lucide-react';

interface SourceText {
  type: string;
  key: string;
  field: string;
  source: string;
  label: string;
  placeholders?: string[];
}

interface Saved {
  type: string;
  key: string;
  field: string;
  value: string;
}

interface Payload {
  locales: { locale: string; translated: number }[];
  locale: string | null;
  source: SourceText[];
  data: Saved[];
}

const TYPE_LABEL: Record<string, string> = {
  achievement: 'Achievements',
  challenge: 'Challenges',
  level: 'Levels',
  streak: 'Streaks',
  currency: 'Currencies',
  reward: 'Store rewards',
  box: 'Mystery boxes',
  box_item: 'Box items',
  pass: 'Season passes',
  goal: 'Shared goals',
  journey: 'Journeys',
  cosmetic: 'Cosmetics',
  team: 'Teams',
  notification: 'Notifications',
};

const slot = (text: { type: string; key: string; field: string }) => `${text.type}\u0000${text.key}\u0000${text.field}`;

/** The name of a language in the viewer's own language, such as "Portuguese (Brazil)". */
function languageName(locale: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(locale) ?? locale;
  } catch {
    return locale;
  }
}

export function TranslationsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [newLocale, setNewLocale] = useState('');
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>('all');
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (wanted: string | null) => {
      if (!projectId) return;
      setError(null);
      try {
        const res = await apiFetch(`/api/projects/${projectId}/translations${wanted ? `?locale=${encodeURIComponent(wanted)}` : ''}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.code === 'FEATURE_DISABLED' ? 'Translations are turned off for your organization by the platform administrator.' : (body?.message ?? "This couldn't load."));
        setPayload(body as Payload);
        setEdits({});
        // The first language is opened by itself, so the page never starts empty when there is one.
        if (!wanted && (body as Payload).locales[0]) setLocale((body as Payload).locales[0]!.locale);
      } catch (err) {
        setError(err instanceof Error ? err.message : "This couldn't load.");
      }
    },
    [projectId]
  );

  useEffect(() => {
    setPayload(null);
    setLocale(null);
    void load(null);
  }, [projectId, load]);

  useEffect(() => {
    if (locale) void load(locale);
  }, [locale, load]);

  const saved = useMemo(() => new Map((payload?.data ?? []).map((row) => [slot(row), row.value])), [payload]);
  const types = useMemo(() => [...new Set((payload?.source ?? []).map((text) => text.type))], [payload]);
  const shown = (payload?.source ?? []).filter((text) => filter === 'all' || text.type === filter);
  const changed = Object.entries(edits).filter(([key, value]) => (saved.get(key) ?? '') !== value);
  const done = payload && locale ? payload.source.filter((text) => (edits[slot(text)] ?? saved.get(slot(text)) ?? '').trim() !== '').length : 0;

  const addLocale = (event: React.FormEvent) => {
    event.preventDefault();
    const tag = newLocale.trim();
    if (!/^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8}){0,3}$/.test(tag)) {
      toast.error('Use a language tag such as fr or pt-BR.');
      return;
    }
    setNewLocale('');
    setLocale(tag.replace(/_/g, '-'));
  };

  const save = async () => {
    if (!projectId || !locale || changed.length === 0) return;
    setSaving(true);
    try {
      const entries = changed.map(([key, value]) => {
        const [type, textKey, field] = key.split('\u0000');
        return { type, key: textKey, field, value };
      });
      const res = await apiFetch(`/api/projects/${projectId}/translations`, { method: 'PUT', body: JSON.stringify({ locale, entries }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'The translations could not be saved.');
      toast.success(`Saved ${body.saved} and removed ${body.removed}.`);
      // The server tidies the tag, so `pt-br` comes back as `pt-BR`.
      if (body.locale !== locale) setLocale(body.locale);
      else await load(locale);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The translations could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const removeLocale = async () => {
    if (!projectId || !locale) return;
    const ok = await confirm({ title: `Remove ${languageName(locale)}?`, message: 'Every translation in this language is deleted. Players who use it see the original text again.', confirmText: 'Remove', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/translations/${encodeURIComponent(locale)}`, { method: 'DELETE' });
    if (res.ok) toast.success('Removed.');
    else toast.error('It could not be removed.');
    setLocale(null);
    setPayload(null);
    await load(null);
  };

  const known = payload?.locales ?? [];
  const options = [...known.map((row) => ({ value: row.locale, label: languageName(row.locale), sublabel: `${row.locale} · ${row.translated} translated` })), ...(locale && !known.some((row) => row.locale === locale) ? [{ value: locale, label: languageName(locale), sublabel: `${locale} · new` }] : [])];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Translations"
        description="Names, descriptions and notification text in each player's language. A player sees a translation when one exists for their language, and the original text otherwise."
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          {error}{' '}
          <button className="underline" onClick={() => void load(locale)}>
            Try again
          </button>
        </div>
      )}
      {!payload && !error && <CardSkeleton />}

      {payload && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-end gap-3 pt-6">
              {options.length > 0 && (
                <div className="min-w-56">
                  <span className="mb-1 block text-xs font-semibold text-zinc-300">Language</span>
                  <Dropdown options={options} value={locale} onChange={setLocale} placeholder="Choose a language" />
                </div>
              )}
              {isAdminOrOwner && (
                <form onSubmit={addLocale} className="flex items-end gap-2">
                  <div className="w-40">
                    <Input label="Add a language" value={newLocale} onChange={(e) => setNewLocale(e.target.value)} placeholder="pt-BR" />
                  </div>
                  <Button type="submit" variant="secondary" size="sm">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </form>
              )}
              {locale && (
                <div className="ml-auto flex items-center gap-2">
                  <Badge variant={done === payload.source.length ? 'emerald' : 'zinc'}>
                    {done} of {payload.source.length} translated
                  </Badge>
                  {isAdminOrOwner && known.some((row) => row.locale === locale) && (
                    <Button variant="ghost" size="sm" onClick={() => void removeLocale()} aria-label={`Remove ${languageName(locale)}`}>
                      <Trash2 className="h-3.5 w-3.5 text-danger-400" />
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {!locale && (
            <EmptyState
              icon={Languages}
              title="No languages yet"
              description="Add a language with its tag, such as fr or pt-BR. Players whose browser or saved language matches it see your translations, and pt-BR falls back to pt."
            />
          )}

          {locale && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="w-56">
                  <Dropdown options={[{ value: 'all', label: 'Everything' }, ...types.map((type) => ({ value: type, label: TYPE_LABEL[type] ?? type }))]} value={filter} onChange={setFilter} />
                </div>
                {isAdminOrOwner && (
                  <Button variant="primary" size="sm" onClick={() => void save()} isLoading={saving} disabled={changed.length === 0}>
                    {changed.length === 0 ? 'Nothing to save' : `Save ${changed.length} ${changed.length === 1 ? 'change' : 'changes'}`}
                  </Button>
                )}
              </div>

              {shown.length === 0 ? (
                <p className="text-sm text-zinc-400">There is nothing of this kind to translate yet.</p>
              ) : (
                <ul className="divide-y divide-zinc-800 border border-zinc-800">
                  {shown.map((text) => {
                    const id = slot(text);
                    const value = edits[id] ?? saved.get(id) ?? '';
                    return (
                      <li key={id} className="grid gap-3 p-4 md:grid-cols-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                            <Badge variant="zinc">{TYPE_LABEL[text.type] ?? text.type}</Badge>
                            <span className="truncate font-mono">{text.key}</span>
                            <span>{text.field}</span>
                          </div>
                          <p className="mt-2 break-words text-sm text-zinc-200">{text.source}</p>
                          {text.placeholders && (
                            <p className="mt-1 text-xs text-zinc-500">
                              You can use: {text.placeholders.map((name) => `{{${name}}}`).join(' ')}
                            </p>
                          )}
                        </div>
                        <Input
                          aria-label={`${languageName(locale)} for ${text.label}, ${text.field}`}
                          value={value}
                          onChange={(e) => setEdits((current) => ({ ...current, [id]: e.target.value }))}
                          placeholder={isAdminOrOwner ? 'Not translated: players see the original' : 'Not translated'}
                          disabled={!isAdminOrOwner}
                          lang={locale}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
