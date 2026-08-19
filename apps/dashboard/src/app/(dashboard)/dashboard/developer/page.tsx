'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDashboard } from '@/components/features/context/dashboard-context';
import {
  Code2,
  Copy,
  Check,
  KeyRound,
  Zap,
  ArrowRight,
  FileText,
  Activity,
  Layers,
  Terminal,
} from 'lucide-react';

interface ProjectMetrics {
  eventsIngested: number;
  requests: {
    received: number;
    successful: number;
    failed: number;
    rateLimited: number;
  };
}

export default function DeveloperPage() {
  const { selectedProject } = useDashboard();
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedPrj, setCopiedPrj] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [metrics, setMetrics] = useState<ProjectMetrics | null>(null);

  useEffect(() => {
    if (!selectedProject?.id) return;
    fetch(`/api/projects/${selectedProject.id}/metrics`, {
      credentials: 'include',
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMetrics(data))
      .catch(() => null);
  }, [selectedProject?.id]);

  const projectId = selectedProject?.id || 'prj_123456789';
  const sampleCurl = `curl -X POST https://gamiapi.fied.cc/v1/events \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: gami_pk_live_REPLACE_ME" \\
  -H "Idempotency-Key: evt_${Date.now()}" \\
  -d '{
    "event": "purchase",
    "user_id": "user_123",
    "payload": { "amount": 4999 }
  }'`;

  const copyToClipboard = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Code2 className="w-6 h-6 text-emerald-400" />
            <h1 className="text-xl font-bold text-white font-mono tracking-tight">Developer Portal</h1>
          </div>
          <p className="text-xs text-zinc-400">
            Build, test, and integrate Gami.Fied Community Engine into your applications.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/developer/docs"
            className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-semibold flex items-center gap-2 transition"
          >
            <FileText className="w-4 h-4" />
            API Reference Docs
          </Link>
          <Link
            href="/dashboard/api-keys"
            className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-mono font-semibold flex items-center gap-2 transition"
          >
            <KeyRound className="w-4 h-4" />
            Manage API Keys
          </Link>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
            <span>Project ID</span>
            <Layers className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono font-bold text-white truncate">{projectId}</span>
            <button
              onClick={() => copyToClipboard(projectId, setCopiedPrj)}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition"
              title="Copy Project ID"
            >
              {copiedPrj ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
            <span>Events Ingested</span>
            <Activity className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-xl font-mono font-bold text-white">
            {metrics ? metrics.eventsIngested.toLocaleString() : '0'}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
            <span>API Requests</span>
            <Terminal className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-mono font-bold text-white">
            {metrics ? metrics.requests.received.toLocaleString() : '0'}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 font-mono mb-2">
            <span>API Status</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-sm font-mono font-bold text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            100% Operational
          </div>
        </div>
      </div>

      {/* Quick Start Integration Wizard */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-6">
        <h2 className="text-base font-mono font-bold text-white flex items-center gap-2">
          <Zap className="w-4 h-4 text-emerald-400" />
          Developer Quick Start Workflow
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          {[
            { step: '1', title: 'Create API Key', desc: 'Generate server-side key' },
            { step: '2', title: 'Copy Project ID', desc: `ID: ${projectId.slice(0, 10)}...` },
            { step: '3', title: 'Choose SDK', desc: 'Node.js, Python, REST' },
            { step: '4', title: 'Send Test Event', desc: 'POST /v1/events' },
            { step: '5', title: 'Create Rule', desc: 'Define XP awards' },
            { step: '6', title: 'Verify Results', desc: 'Check user XP balance' },
          ].map((item, idx) => (
            <div key={item.step} className="bg-zinc-950 border border-zinc-800/80 p-3 relative">
              <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-widest mb-1">
                Step {item.step}
              </div>
              <div className="text-xs font-mono font-bold text-white truncate">{item.title}</div>
              <div className="text-[11px] text-zinc-500 mt-1 truncate">{item.desc}</div>
              {idx < 5 && (
                <div className="hidden md:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10">
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-700" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* cURL Example Code Box */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span>Sample Event Ingestion cURL Request</span>
            <button
              onClick={() => copyToClipboard(sampleCurl, setCopiedCurl)}
              className="flex items-center gap-1 hover:text-white transition"
            >
              {copiedCurl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy cURL</span>
                </>
              )}
            </button>
          </div>
          <pre className="p-4 bg-zinc-950 border border-zinc-800 font-mono text-xs text-emerald-300 overflow-x-auto">
            {sampleCurl}
          </pre>
        </div>
      </div>
    </div>
  );
}
