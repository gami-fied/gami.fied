'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Search } from 'lucide-react';
import { EndpointSection, MethodBadge } from './endpoint-section';
import { GUIDES, Guides } from './guides';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { TableSkeleton } from '@/components/ui/skeleton';
import { useCachedState } from '@/hooks/use-cached-state';
import { usePublicApiUrl } from '@/hooks/use-public-api-url';
import { apiJson } from '@/lib/api-client';
import {
  filterGroups,
  groupEndpoints,
  SAMPLE_LANGUAGES,
  type OpenApiSpec,
  type SampleLanguage,
} from '@/lib/openapi-docs';

const LANGUAGE_KEY = 'gami.docsLanguage';

export function ApiDocsView() {
  const [spec, setSpec] = useCachedState<OpenApiSpec | null>('openapi', null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [language, setLanguage] = useState<SampleLanguage>('curl');
  const baseUrl = usePublicApiUrl();

  const load = React.useCallback(() => {
    setFailed(false);
    apiJson<OpenApiSpec>('/openapi.json')
      .then(setSpec)
      .catch(() => setFailed(true));
  }, [setSpec]);

  useEffect(load, [load]);

  useEffect(() => {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (SAMPLE_LANGUAGES.some((option) => option.id === saved)) {
      setLanguage(saved as SampleLanguage);
    }
  }, []);

  // A shared link points below content that only exists once the spec has loaded.
  const hasSpec = Boolean(spec);
  useEffect(() => {
    if (!hasSpec || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [hasSpec]);

  const changeLanguage = (next: SampleLanguage) => {
    localStorage.setItem(LANGUAGE_KEY, next);
    setLanguage(next);
  };

  const allGroups = useMemo(() => (spec ? groupEndpoints(spec) : []), [spec]);
  const groups = useMemo(() => filterGroups(allGroups, search), [allGroups, search]);
  const isSearching = search.trim().length > 0;

  if (!spec) {
    return failed ? (
      <EmptyState
        icon={AlertTriangle}
        title="Couldn't load the API docs"
        description="The API didn't respond. Try again in a moment."
        action={{ label: 'Try again', onClick: load }}
      />
    ) : (
      <TableSkeleton rows={8} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Docs"
        description="Everything you need to send events and read progress from your app."
        actions={
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-2 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            OpenAPI file
          </a>
        }
      />

      <div className="flex gap-8">
        <nav
          aria-label="API docs"
          className="hidden lg:block w-56 shrink-0 sticky top-20 self-start max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 space-y-4"
        >
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
            <input
              type="search"
              aria-label="Search endpoints"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search endpoints"
              className="w-full pl-8 pr-2 py-1.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-400 outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {!isSearching && (
            <div>
              <div className="pb-1 text-[11px] font-semibold text-zinc-400">Guides</div>
              {GUIDES.map((guide) => (
                <a
                  key={guide.id}
                  href={`#${guide.id}`}
                  className="block py-1 text-xs text-zinc-300 hover:text-brand-400 transition-colors"
                >
                  {guide.name}
                </a>
              ))}
            </div>
          )}

          {groups.map((group) => (
            <div key={group.name}>
              <div className="pb-1 text-[11px] font-semibold text-zinc-400">{group.name}</div>
              {group.endpoints.map(({ id, method, operation }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  title={operation.summary}
                  className="flex items-center gap-2 py-1 text-xs text-zinc-300 hover:text-brand-400 transition-colors"
                >
                  <MethodBadge method={method} />
                  <span className="truncate">{operation.summary}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0">
          <div className="lg:hidden relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="search"
              aria-label="Search endpoints"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search endpoints"
              className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 text-sm text-zinc-200 placeholder:text-zinc-400 outline-none focus:border-brand-500 transition-colors"
            />
          </div>

          {!isSearching && <Guides baseUrl={baseUrl} />}

          {groups.length === 0 && (
            <EmptyState
              icon={Search}
              title="No endpoints match"
              description="Try a different word, such as users, xp or events."
            />
          )}

          {groups.map((group) => (
            <div key={group.name} className="pt-6">
              <h2 className="text-lg font-bold text-zinc-100">{group.name}</h2>
              {group.endpoints.map((endpoint) => (
                <EndpointSection
                  key={endpoint.id}
                  spec={spec}
                  endpoint={endpoint}
                  baseUrl={baseUrl}
                  language={language}
                  onLanguageChange={changeLanguage}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
