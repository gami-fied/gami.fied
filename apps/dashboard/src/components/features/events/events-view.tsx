'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useEvents, EventRecord } from '@/hooks/use-events';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TablePagination,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { JsonViewer } from '@/components/ui/json-viewer';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { useToast } from '@/components/ui/toast';
import {
  Eye,
  Search,
  RefreshCw,
  Copy,
  Check,
  Radio,
  Send,
  Sparkles,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { formatRelativeTime } from '@/hooks/use-relative-time';

const AUTO_REFRESH_INTERVAL = 30_000; // 30 seconds

export function EventsView() {
  const { selectedProject, selectedOrg } = useDashboard();
  const projectId = selectedProject?.id || null;
  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg?.role || 'member');

  const { events, loading, error, page, hasMore, fetchEvents } = useEvents(projectId);
  const toast = useToast();

  const [typeFilter, setTypeFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventRecord | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // Ingestion Playground Modal state
  const [isEmitOpen, setIsEmitOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'session' | 'sdk'>('session');
  const [rawSecretKey, setRawSecretKey] = useState('');
  const [emitType, setEmitType] = useState('user_signed_up');
  const [emitUserId, setEmitUserId] = useState('usr_101');
  const [emitIdempotencyKey, setEmitIdempotencyKey] = useState('');
  const [emitPayloadJson, setEmitPayloadJson] = useState(
    JSON.stringify({ source: 'marketing_landing', plan: 'pro' }, null, 2)
  );
  const [emitting, setEmitting] = useState(false);
  const [emitError, setEmitError] = useState<string | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchEvents(1, typeFilter, userIdFilter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Auto-refresh logic
  useEffect(() => {
    if (autoRefresh && projectId) {
      autoRefreshRef.current = setInterval(() => {
        fetchEvents(page, typeFilter, userIdFilter);
      }, AUTO_REFRESH_INTERVAL);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, projectId, page, typeFilter, userIdFilter, fetchEvents]);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvents(1, typeFilter, userIdFilter);
  };

  const handleCopyEventId = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      setCopiedId(id);
      toast.success('Event ID copied', id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const handleApplyPreset = (presetName: string) => {
    if (presetName === 'signup') {
      setEmitType('user_signed_up');
      setEmitUserId('usr_101');
      setEmitPayloadJson(JSON.stringify({ source: 'marketing_landing', plan: 'pro' }, null, 2));
    } else if (presetName === 'order') {
      setEmitType('order_completed');
      setEmitUserId('usr_101');
      setEmitPayloadJson(
        JSON.stringify({ amount: 149.99, currency: 'USD', items_count: 3 }, null, 2)
      );
    } else if (presetName === 'streak') {
      setEmitType('streak_maintained');
      setEmitUserId('usr_101');
      setEmitPayloadJson(JSON.stringify({ days: 7, bonus_multiplier: 1.5 }, null, 2));
    }
  };

  const handleEmitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmitError(null);

    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(emitPayloadJson);
    } catch {
      setEmitError('Invalid JSON payload structure');
      return;
    }

    setEmitting(true);
    try {
      let endpoint = `/api/projects/${projectId}/events/test`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (authMode === 'sdk') {
        if (!rawSecretKey.trim()) {
          setEmitError('Please enter your full x-api-key secret string (e.g. gami_live_...).');
          setEmitting(false);
          return;
        }
        endpoint = '/v1/events';
        headers['x-api-key'] = rawSecretKey.trim();
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          event: emitType,
          user_id: emitUserId || undefined,
          idempotency_key: emitIdempotencyKey || undefined,
          payload: parsedPayload,
        }),
      });

      const resData = await res.json();
      if (res.ok) {
        toast.success('Event ingested successfully', `Event ID: ${resData.id || resData.eventId}`);
        setIsEmitOpen(false);
        fetchEvents(1, typeFilter, userIdFilter);
      } else {
        setEmitError(resData.message || resData.error || 'Failed to ingest event');
      }
    } catch (err: unknown) {
      setEmitError((err as Error).message || 'Failed to send event');
    } finally {
      setEmitting(false);
    }
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to view events.
      </div>
    );
  }

  // Custom Dropdown Auth Mode Options
  const authModeOptions: DropdownOption[] = [
    {
      value: 'session',
      label: 'Dashboard Session Auth (Secure Default)',
      sublabel: 'Uses active login cookie — zero key storage needed',
      icon: <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />,
    },
    {
      value: 'sdk',
      label: 'External SDK API Key (x-api-key)',
      sublabel: 'Test raw API key header against /v1/events',
      icon: <KeyRound className="w-3.5 h-3.5 text-orange-400" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Event Stream</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time customer event ingestion log for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Send Test Event Playground Button */}
          <Button
            variant="primary"
            size="sm"
            disabled={!isAdminOrOwner}
            title={!isAdminOrOwner ? 'Requires Admin or Owner role to ingest test events' : undefined}
            onClick={() => isAdminOrOwner && setIsEmitOpen(true)}
            className={!isAdminOrOwner ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700' : undefined}
          >
            <Send className="w-3.5 h-3.5" />
            Send Test Event
          </Button>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-none text-xs font-semibold border transition ${
              autoRefresh
                ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-300'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
            title={autoRefresh ? 'Click to disable auto-refresh' : 'Enable 30s auto-refresh'}
          >
            <Radio
              className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-400' : ''}`}
            />
            {autoRefresh ? 'Live (30s)' : 'Auto-refresh'}
          </button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchEvents(page, typeFilter, userIdFilter)}
            isLoading={loading}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Form */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleFilterSubmit} className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <Input
                label="Filter by Event Type"
                placeholder="e.g. user_signed_up"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Filter by End-User ID"
                placeholder="e.g. usr_123"
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              <Search className="w-4 h-4" />
              Apply Filters
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Events Table */}
      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
          {error}
        </div>
      )}

      {loading && events.length === 0 ? (
        <TableSkeleton rows={8} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event ID</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>End-User ID</TableHead>
                  <TableHead>Occurred</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((evt) => (
                  <TableRow key={evt.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-zinc-300 truncate max-w-[140px]">
                          {evt.id}
                        </span>
                        <button
                          onClick={() => handleCopyEventId(evt.id)}
                          className="p-1 text-zinc-600 hover:text-zinc-300 transition shrink-0"
                          title="Copy Event ID"
                        >
                          {copiedId === evt.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="orange">{evt.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-zinc-400">
                      {evt.userId || <span className="text-zinc-600">Anonymous</span>}
                    </TableCell>
                    <TableCell
                      className="text-xs text-zinc-400 cursor-default"
                      title={new Date(evt.occurredAt).toLocaleString()}
                    >
                      {formatRelativeTime(evt.occurredAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEvent(evt)}
                        className="text-orange-400 hover:text-orange-300"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View JSON
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {events.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-zinc-500 text-xs">
                      No events recorded yet for this project.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {events.length > 0 && (
              <TablePagination
                page={page}
                limit={15}
                hasMore={hasMore}
                onPageChange={(p) => fetchEvents(p, typeFilter, userIdFilter)}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Interactive Event Ingestion Playground Dialog */}
      <Dialog
        isOpen={isEmitOpen}
        onClose={() => setIsEmitOpen(false)}
        title="Event Ingestion Playground"
        description="Construct and emit customer events directly to the ingestion engine."
      >
        <form onSubmit={handleEmitSubmit} className="space-y-4">
          {emitError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-200 text-xs rounded-none">
              {emitError}
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400" /> Quick Payload Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset('signup')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                User Signup
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('order')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                Order Completed
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('streak')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                Streak Maintained
              </button>
            </div>
          </div>

          {/* Authentication Mode Selection using Custom Dropdown */}
          <div className="space-y-2 bg-zinc-950 p-3.5 rounded-none border border-zinc-800/80">
            <Dropdown
              label="Authentication Method"
              options={authModeOptions}
              value={authMode}
              onChange={(val) => {
                setAuthMode(val as 'session' | 'sdk');
                setEmitError(null);
              }}
            />

            {authMode === 'session' ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/30 border border-emerald-800/40 rounded-none text-xs text-emerald-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Authenticated via active Dashboard session for{' '}
                  <strong className="text-emerald-200">{selectedProject.name}</strong>. Zero secret
                  key storage needed.
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                <Input
                  label="x-api-key Secret *"
                  type="password"
                  placeholder="e.g. gami_live_xxxxxxxx..."
                  value={rawSecretKey}
                  onChange={(e) => setRawSecretKey(e.target.value)}
                  required
                />
                <span className="text-[11px] text-zinc-500 block px-1">
                  Enter your raw API key secret string. Key is held temporarily in component memory
                  and never saved to browser storage.
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Event Name *"
              placeholder="e.g. user_signed_up"
              value={emitType}
              onChange={(e) => setEmitType(e.target.value)}
              required
            />
            <Input
              label="End-User ID"
              placeholder="e.g. usr_101"
              value={emitUserId}
              onChange={(e) => setEmitUserId(e.target.value)}
            />
          </div>

          <Input
            label="Idempotency Key (Optional)"
            placeholder="e.g. key_unique_123"
            value={emitIdempotencyKey}
            onChange={(e) => setEmitIdempotencyKey(e.target.value)}
          />

          {/* JSON Payload Editor */}
          <div className="space-y-1">
            <label className="block text-xs font-semibold text-zinc-300">
              Event Payload (JSON Object)
            </label>
            <textarea
              rows={4}
              className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-none font-mono text-xs text-zinc-200 focus:outline-none focus:border-orange-500 transition"
              value={emitPayloadJson}
              onChange={(e) => setEmitPayloadJson(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEmitOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={emitting}>
              <Send className="w-3.5 h-3.5" />
              Emit Event
            </Button>
          </div>
        </form>
      </Dialog>

      {/* JSON Payload Inspection Dialog */}
      <Dialog
        isOpen={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title={`Event Payload: ${selectedEvent?.id}`}
        description={`Event Type: ${selectedEvent?.type} • Occurred: ${
          selectedEvent ? new Date(selectedEvent.occurredAt).toLocaleString() : ''
        }`}
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-950 p-3 rounded-none border border-zinc-800">
              <div>
                <span className="text-zinc-500 block">End User ID</span>
                <span className="font-mono text-zinc-200 font-medium">
                  {selectedEvent.userId || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 block">Idempotency Key</span>
                <span className="font-mono text-zinc-200 font-medium">
                  {selectedEvent.idempotencyKey || 'None'}
                </span>
              </div>
            </div>

            <JsonViewer data={selectedEvent.payload} title="Customer Event Payload (JSON)" />
          </div>
        )}
      </Dialog>
    </div>
  );
}
