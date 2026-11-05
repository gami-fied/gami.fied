'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import { FileText, ExternalLink, RefreshCw, Lock, ShieldCheck } from 'lucide-react';

interface OpenApiSpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers?: { url: string; description?: string }[];
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        parameters?: { in: string; name: string; required?: boolean; description?: string }[];
        requestBody?: { required?: boolean; content?: Record<string, { schema?: unknown }> };
        responses?: Record<string, { description?: string }>;
      }
    >
  >;
}

// Shown only until the real spec loads, so this page can't drift from the API.
const DEFAULT_SPEC: OpenApiSpec = {
  openapi: '3.1.0',
  info: { title: 'Gami.Fied API', version: '', description: '' },
  paths: {},
};

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<OpenApiSpec>(DEFAULT_SPEC);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const fetchSpec = () => {
    setLoading(true);
    apiFetch('/openapi.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.paths) {
          setSpec(data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchSpec();
  }, []);

  const paths = spec?.paths ? Object.entries(spec.paths) : [];
  const filteredPaths = paths.filter(([pathUrl, methods]) => {
    if (!search) return true;
    const q = search.toLowerCase();
    if (pathUrl.toLowerCase().includes(q)) return true;
    return Object.values(methods).some((m) => m.summary?.toLowerCase().includes(q));
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileText className="w-6 h-6 text-success-400" />
            <h1 className="text-xl font-bold text-white tracking-tight">
              Interactive API Reference (OpenAPI 3.1)
            </h1>
          </div>
          <p className="text-xs text-zinc-400">
            {spec.info.description || 'Self-hostable OpenAPI 3.1 documentation for public and project-scoped APIs.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSpec}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            title="Reload OpenAPI Specification" aria-label="Reload OpenAPI Specification"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href="/openapi.json"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-2 bg-success-500/10 hover:bg-success-500/20 text-success-400 border border-success-500/30 text-xs font-semibold flex items-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4" />
            Raw openapi.json
          </a>
        </div>
      </div>

      {/* Security & Authentication Notice */}
      <div className="bg-zinc-900 border border-zinc-800 p-4 flex items-center justify-between gap-4 text-xs text-zinc-300">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-success-400 shrink-0" />
          <span>Public API Key Header: <code className="text-success-400 font-bold">x-api-key: gami_live_...</code></span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-info-400 shrink-0" />
          <span>Canonical Idempotency Header: <code className="text-info-400 font-bold">Idempotency-Key: &lt;uuid&gt;</code></span>
        </div>
      </div>

      {/* Search Filter Bar */}
      <div className="bg-zinc-900 border border-zinc-800 p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search endpoints by path or summary (e.g. /v1/events, metrics, health)..."
          className="w-full bg-zinc-950 border border-zinc-800 px-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-success-500"
        />
      </div>

      {/* Endpoint Cards List */}
      {filteredPaths.length === 0 ? (
        <div className="p-8 text-center text-xs text-zinc-400">No matching API endpoints found.</div>
      ) : (
        <div className="space-y-4">
          {filteredPaths.map(([pathUrl, methods]) =>
            Object.entries(methods).map(([method, details]) => (
              <div key={`${method}-${pathUrl}`} className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2.5 py-1 text-[11px] font-bold border ${
                        method.toUpperCase() === 'POST'
                          ? 'bg-success-500/10 text-success-400 border-success-500/30'
                          : method.toUpperCase() === 'GET'
                          ? 'bg-info-500/10 text-info-400 border-info-500/30'
                          : 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                      }`}
                    >
                      {method}
                    </span>
                    <span className="font-bold text-sm text-white">{pathUrl}</span>
                  </div>
                  <span className="text-xs text-zinc-400">
                    OpenAPI 3.1 Route
                  </span>
                </div>

                {details.summary && (
                  <p className="text-xs text-zinc-200 font-semibold">{details.summary}</p>
                )}
                {details.description && (
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">{details.description}</p>
                )}

                {/* Parameters Table */}
                {details.parameters && details.parameters.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-bold text-zinc-400 block">
                      Parameters & Headers
                    </span>
                    <div className="bg-zinc-950 border border-zinc-800/80 divide-y divide-zinc-800/60">
                      {details.parameters.map((param, idx) => (
                        <div key={idx} className="p-2.5 text-xs font-mono flex items-center justify-between gap-4">
                          <div className="flex items-center gap-2">
                            <span className="text-success-400 font-bold">{param.name}</span>
                            <span className="text-xs text-zinc-400 px-1.5 py-0.5 bg-zinc-900 border border-zinc-800">
                              {param.in}
                            </span>
                            {param.required && (
                              <span className="text-xs text-danger-400 font-bold">Required</span>
                            )}
                          </div>
                          <span className="text-zinc-400 text-right truncate">{param.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Response HTTP Status Codes */}
                {details.responses && (
                  <div className="space-y-2 pt-2">
                    <span className="text-[11px] font-bold text-zinc-400 block">
                      HTTP Response Codes
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(details.responses).map(([code, resp]) => (
                        <div
                          key={code}
                          className={`px-2.5 py-1 text-xs border flex items-center gap-2 ${
                            code.startsWith('2')
                              ? 'bg-success-500/10 text-success-400 border-success-500/30'
                              : code.startsWith('4')
                              ? 'bg-brand-500/10 text-brand-400 border-brand-500/30'
                              : 'bg-danger-500/10 text-danger-400 border-danger-500/30'
                          }`}
                        >
                          <span className="font-bold">{code}</span>
                          <span className="text-zinc-400 text-[11px]">{resp.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
