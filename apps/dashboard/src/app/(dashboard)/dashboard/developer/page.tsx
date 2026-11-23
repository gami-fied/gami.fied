'use client';

import { usePublicApiUrl } from '@/hooks/use-public-api-url';
import { apiFetch } from '@/lib/api-client';
import { DOCS, starterSnippets } from '@/lib/starter-snippets';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/components/features/context/dashboard-context';
import { Activity, BookOpen, Check, Copy, ExternalLink, KeyRound, Terminal } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { IconButton } from '@gami/ui';

interface ProjectMetrics {
  eventsIngested: number;
  requests: {
    received: number;
    successful: number;
    failed: number;
    rateLimited: number;
  };
}

/** The website's guides, which this page links to rather than repeats. */
const DOC_LINKS = [
  { href: DOCS.home, title: 'Docs home', detail: 'Every guide, with search.' },
  { href: DOCS.gettingStarted, title: 'Getting started', detail: 'From install to the first XP.' },
  { href: DOCS.apiReference, title: 'API overview', detail: 'Routes, keys, scopes and errors.' },
  { href: DOCS.apiExplorer, title: 'Try the API', detail: 'Send requests from the browser.' },
];

/** Copies text and shows a tick for two seconds. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <IconButton
      size="sm"
      label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success-400" /> : <Copy className="h-3.5 w-3.5" />}
    </IconButton>
  );
}

/** One fact about this install, with a copy button when it is something to paste. */
function InstallFact({ label, value, copy }: { label: string; value: React.ReactNode; copy?: string }) {
  return (
    <div className="min-w-0 border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-1 text-xs text-zinc-400">{label}</div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-sm font-bold text-white">{value}</span>
        {copy && <CopyButton text={copy} label={`Copy the ${label.toLowerCase()}`} />}
      </div>
    </div>
  );
}

export default function DeveloperPage() {
  const { selectedProject } = useDashboard();
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const apiUrl = usePublicApiUrl();
  const projectId = selectedProject?.id ?? '';

  useEffect(() => {
    if (!projectId) return;
    apiFetch(`/api/projects/${projectId}/metrics`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMetrics(data))
      .catch(() => null);
  }, [projectId]);

  useEffect(() => {
    fetch('/server-version')
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { version?: string } | null) => setVersion(body?.version ?? null))
      .catch(() => null);
  }, []);

  const snippets = starterSnippets(apiUrl);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Developer Hub"
        description="Connect your app to Gami.Fied."
        actions={
          <>
            <a
              href={DOCS.home}
              target="_blank"
              rel="noreferrer"
              className="flex h-9 items-center gap-2 border border-zinc-700 bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
            >
              <BookOpen className="h-4 w-4" />
              Docs
              <ExternalLink className="h-3 w-3 text-zinc-400" />
            </a>
            <Link
              href="/dashboard/api-keys"
              className="flex h-9 items-center gap-2 border border-zinc-700 bg-zinc-800 px-3 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-700"
            >
              <KeyRound className="h-4 w-4" />
              API Keys
            </Link>
          </>
        }
      />

      {/* What only this install knows. */}
      <section aria-labelledby="install-heading" className="space-y-3">
        <h2 id="install-heading" className="text-sm font-bold text-zinc-100">
          This install
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InstallFact label="API address" value={apiUrl || '…'} copy={apiUrl || undefined} />
          <InstallFact label="Project ID" value={projectId || '…'} copy={projectId || undefined} />
          <InstallFact label="Server version" value={version ?? '…'} />
        </div>
        <p className="text-xs text-zinc-400">
          The docs on the website are for the latest release.{version ? ` This server runs ${version}.` : ''} Send requests
          to the API address above, with an API key from{' '}
          <Link href="/dashboard/api-keys" className="text-brand-400 hover:underline">
            API Keys
          </Link>
          .
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>Events received</span>
              <Activity className="h-4 w-4 text-brand-400" />
            </div>
            <div className="text-xl font-bold text-white">{metrics ? metrics.eventsIngested.toLocaleString() : '—'}</div>
          </div>
          <div className="border border-zinc-800 bg-zinc-900 p-4">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>API requests</span>
              <Terminal className="h-4 w-4 text-info-400" />
            </div>
            <div className="text-xl font-bold text-white">{metrics ? metrics.requests.received.toLocaleString() : '—'}</div>
          </div>
        </div>
      </section>

      {/* Links to the guides on the website. */}
      <section aria-labelledby="docs-heading" className="space-y-3">
        <h2 id="docs-heading" className="text-sm font-bold text-zinc-100">
          Read the docs
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DOC_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="group border border-zinc-800 bg-zinc-900 p-4 transition hover:border-zinc-700"
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-100 group-hover:text-brand-400">
                {link.title}
                <ExternalLink className="h-3 w-3 text-zinc-400" />
              </span>
              <span className="mt-1 block text-xs text-zinc-400">{link.detail}</span>
            </a>
          ))}
        </div>
      </section>

      {/* Four snippets to get started, with this install's address filled in. */}
      <section aria-labelledby="start-heading" className="space-y-3">
        <h2 id="start-heading" className="text-sm font-bold text-zinc-100">
          Get started
        </h2>
        <p className="text-xs text-zinc-400">
          Replace <code className="font-mono text-zinc-300">gami_live_REPLACE_ME</code> with a key from API Keys. Keep the key on your
          server, and give browsers a player token instead.
        </p>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {snippets.map((snippet, index) => (
            <div key={snippet.id} className="flex min-w-0 flex-col border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {index + 1}. {snippet.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400">{snippet.description}</p>
                </div>
                <CopyButton text={snippet.code} label={`Copy: ${snippet.title}`} />
              </div>
              <pre tabIndex={0} className="flex-1 overflow-x-auto border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-200">
                {snippet.code}
              </pre>
              <a
                href={snippet.readMore}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 self-start text-xs text-brand-400 hover:underline"
              >
                Read more
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
