'use client';

import { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useWebhooks } from '@/hooks/use-webhooks';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import type { SdkWebhookEventType, WebhookDeliveryRecord, WebhookEndpointRecord } from '@gami/sdk';

const WEBHOOK_EVENT_ITEMS: ChecklistItem<SdkWebhookEventType>[] = [
  {
    value: 'xp.awarded',
    label: 'xp.awarded',
    description: 'Triggered when XP is awarded to a user via rules engine or manual adjustment.',
    badge: 'XP',
  },
  {
    value: 'achievement.unlocked',
    label: 'achievement.unlocked',
    description: 'Triggered when a user unlocks a new achievement badge.',
    badge: 'Achievement',
  },
  {
    value: 'level.up',
    label: 'level.up',
    description: 'Triggered when a user crosses a level XP threshold and levels up.',
    badge: 'Progression',
  },
  {
    value: 'challenge.completed',
    label: 'challenge.completed',
    description: 'Triggered when a user satisfies all target progress requirements for a challenge.',
    badge: 'Challenge',
  },
  {
    value: 'user.created',
    label: 'user.created',
    description: 'Triggered when a new end-user profile is created or provisioned.',
    badge: 'User',
  },
  {
    value: 'user.deactivated',
    label: 'user.deactivated',
    description: 'Triggered when an end-user profile is soft-deactivated.',
    badge: 'User',
  },
];

// Event type → color mapping for consistent pill colors
const EVENT_COLOR: Record<string, string> = {
  'xp.awarded': 'bg-orange-950/60 text-orange-300 border-orange-800/60',
  'achievement.unlocked': 'bg-purple-950/60 text-purple-300 border-purple-800/60',
  'level.up': 'bg-amber-950/60 text-amber-300 border-amber-800/60',
  'challenge.completed': 'bg-blue-950/60 text-blue-300 border-blue-800/60',
  'user.created': 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
  'user.deactivated': 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

function EventPill({ event }: { event: SdkWebhookEventType }) {
  const color = EVENT_COLOR[event] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span className={`inline-block border px-1.5 py-0.5 text-[10px] font-mono font-semibold whitespace-nowrap ${color}`}>
      {event}
    </span>
  );
}

// Inline overflow-aware event list — shows up to N pills then "+X more"
function EventList({ events, max = 2 }: { events: SdkWebhookEventType[]; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, max);
  const overflow = events.length - max;

  return (
    <div className="flex flex-wrap gap-1 items-start">
      {visible.map((e) => (
        <EventPill key={e} event={e} />
      ))}
      {!expanded && overflow > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
          className="text-[10px] font-mono text-zinc-500 hover:text-orange-400 transition border border-zinc-700 px-1.5 py-0.5 bg-zinc-900 whitespace-nowrap"
        >
          +{overflow} more
        </button>
      )}
      {expanded && overflow > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="text-[10px] font-mono text-zinc-500 hover:text-orange-400 transition border border-zinc-700 px-1.5 py-0.5 bg-zinc-900 whitespace-nowrap"
        >
          show less
        </button>
      )}
    </div>
  );
}

// Compact overflow menu for secondary row actions
function ActionsMenu({
  ep,
  onHistory,
  onRotate,
  onDisable,
}: {
  ep: WebhookEndpointRecord;
  onHistory: () => void;
  onRotate: () => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] uppercase border border-zinc-700 font-mono tracking-wider"
        title="More actions"
      >
        ⋯
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-950 border border-zinc-700 shadow-xl min-w-[160px] flex flex-col">
            <button
              onClick={() => { setOpen(false); onHistory(); }}
              className="px-3 py-2 text-left text-[11px] font-mono text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            >
              📋 Delivery History
            </button>
            <button
              onClick={() => { setOpen(false); onRotate(); }}
              className="px-3 py-2 text-left text-[11px] font-mono text-amber-300 hover:bg-amber-950/40 hover:text-amber-200 transition border-t border-zinc-800"
            >
              🔑 Rotate Secret
            </button>
            <button
              onClick={() => { setOpen(false); onDisable(); }}
              className="px-3 py-2 text-left text-[11px] font-mono text-red-400 hover:bg-red-950/40 hover:text-red-300 transition border-t border-zinc-800"
            >
              ⊘ Disable Endpoint
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Inline confirm dialog (replaces browser confirm())
function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md border border-zinc-700 bg-zinc-950 p-6 space-y-4 font-mono shadow-2xl">
        <h3 className="text-sm font-bold uppercase text-white tracking-wide">{title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs uppercase border border-zinc-700"
          >
            Cancel
          </button>
          <button onClick={onConfirm} className={`px-4 py-1.5 text-xs font-bold uppercase ${confirmClass}`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function WebhooksView() {
  const { selectedProject } = useDashboard();
  const {
    endpoints,
    loading,
    error,
    refresh,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    rotateSecret,
    testWebhook,
    fetchDeliveries,
    replayDelivery,
  } = useWebhooks(selectedProject?.id || null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpointRecord | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    confirmClass: string;
    onConfirm: () => void;
  } | null>(null);

  // Alert/toast state
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Delivery Modal State
  const [selectedEndpointForDeliveries, setSelectedEndpointForDeliveries] =
    useState<WebhookEndpointRecord | null>(null);
  const [deliveries, setDeliveries] = useState<WebhookDeliveryRecord[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<SdkWebhookEventType[]>([
    'xp.awarded',
    'achievement.unlocked',
    'level.up',
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showAlert = (type: 'success' | 'error', msg: string) => {
    setAlertMsg({ type, msg });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  const showConfirm = (
    title: string,
    message: string,
    confirmLabel: string,
    confirmClass: string,
    onConfirm: () => void
  ) => {
    setConfirmState({ title, message, confirmLabel, confirmClass, onConfirm });
  };

  const handleOpenCreate = () => {
    setName('');
    setUrl('');
    setDescription('');
    setSelectedEvents(['xp.awarded', 'achievement.unlocked', 'level.up']);
    setFormError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (ep: WebhookEndpointRecord) => {
    setEditingEndpoint(ep);
    setName(ep.name);
    setUrl(ep.url);
    setDescription(ep.description || '');
    setSelectedEvents(ep.events || []);
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) return setFormError('Name is required');
    if (!url.trim()) return setFormError('URL is required');
    if (selectedEvents.length === 0) return setFormError('Select at least one event subscription');

    setSubmitting(true);
    try {
      const res = await createEndpoint({ name, url, description: description || undefined, events: selectedEvents });
      setIsCreateOpen(false);
      setRevealedSecret(res.secret);
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Failed to create webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEndpoint) return;
    setFormError(null);

    setSubmitting(true);
    try {
      await updateEndpoint(editingEndpoint.id, { name, url, description: description || undefined, events: selectedEvents });
      setEditingEndpoint(null);
      showAlert('success', `Webhook "${name}" updated successfully.`);
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Failed to update webhook');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotateSecret = (ep: WebhookEndpointRecord) => {
    showConfirm(
      'Rotate Signing Secret',
      `Are you sure you want to rotate the signing secret for "${ep.name}"? All previous signatures will immediately fail — update your server-side webhook verification.`,
      'Rotate Secret',
      'bg-amber-600 hover:bg-amber-500 text-white border border-amber-500',
      async () => {
        setConfirmState(null);
        try {
          const res = await rotateSecret(ep.id);
          setRevealedSecret(res.secret);
        } catch (err: unknown) {
          showAlert('error', (err as Error).message || 'Failed to rotate secret');
        }
      }
    );
  };

  const handleTestWebhook = async (ep: WebhookEndpointRecord) => {
    try {
      const res = await testWebhook(ep.id);
      showAlert('success', `Test event queued for "${ep.name}". ${res.message || ''}`);
    } catch (err: unknown) {
      showAlert('error', (err as Error).message || 'Failed to queue test webhook');
    }
  };

  const handleViewDeliveries = async (ep: WebhookEndpointRecord) => {
    setSelectedEndpointForDeliveries(ep);
    setDeliveriesLoading(true);
    try {
      const res = await fetchDeliveries(ep.id);
      setDeliveries(res.deliveries || []);
    } catch (err: unknown) {
      showAlert('error', (err as Error).message || 'Failed to load deliveries');
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleReplayDelivery = async (deliveryId: string) => {
    if (!selectedEndpointForDeliveries) return;
    try {
      await replayDelivery(selectedEndpointForDeliveries.id, deliveryId);
      showAlert('success', 'Delivery replayed successfully.');
      const res = await fetchDeliveries(selectedEndpointForDeliveries.id);
      setDeliveries(res.deliveries || []);
    } catch (err: unknown) {
      showAlert('error', (err as Error).message || 'Failed to replay delivery');
    }
  };

  const handleDisableEndpoint = (ep: WebhookEndpointRecord) => {
    showConfirm(
      'Disable Webhook Endpoint',
      `Are you sure you want to disable "${ep.name}"? No further deliveries will be attempted until you re-enable it.`,
      'Disable',
      'bg-red-800 hover:bg-red-700 text-white border border-red-700',
      async () => {
        setConfirmState(null);
        try {
          await deleteEndpoint(ep.id);
          showAlert('success', `Webhook "${ep.name}" disabled.`);
        } catch (err: unknown) {
          showAlert('error', (err as Error).message || 'Failed to disable webhook');
        }
      }
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center font-mono text-zinc-400">
        Please select a project to manage webhooks.
      </div>
    );
  }

  return (
    <div className="space-y-6 font-mono text-zinc-100">

      {/* Toast / Alert Banner */}
      {alertMsg && (
        <div
          className={`flex items-center justify-between px-4 py-3 text-xs border ${
            alertMsg.type === 'success'
              ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300'
              : 'bg-red-950/50 border-red-700/60 text-red-300'
          }`}
        >
          <span>{alertMsg.msg}</span>
          <button onClick={() => setAlertMsg(null)} className="text-zinc-500 hover:text-white ml-4 shrink-0">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white uppercase">Webhook Endpoints</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Receive signed, durable HTTP notifications when gamification events occur in project{' '}
            <span className="text-emerald-400">{selectedProject.name}</span>.
          </p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="shrink-0 bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors uppercase tracking-wider"
        >
          + Add Endpoint
        </button>
      </div>

      {error && (
        <div className="border border-red-800 bg-red-950/40 p-4 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Main Table */}
      <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
        <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            {/* Name/URL: flexible */}
            <col style={{ width: '26%' }} />
            {/* Events: capped so it can't push actions off-screen */}
            <col style={{ width: '30%' }} />
            {/* Status */}
            <col style={{ width: '10%' }} />
            {/* Last Delivery */}
            <col style={{ width: '14%' }} />
            {/* Actions: fixed — never wraps */}
            <col style={{ width: '20%' }} />
          </colgroup>

          <thead className="border-b border-zinc-800 bg-zinc-900/60 uppercase text-zinc-400 text-[10px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Endpoint / URL</th>
              <th className="px-4 py-3">Subscribed Events</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Delivery</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-800/60">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border border-orange-500 border-t-transparent animate-spin" />
                    Loading webhook endpoints...
                  </div>
                </td>
              </tr>
            ) : endpoints.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                  <div className="space-y-2">
                    <div className="text-2xl">📡</div>
                    <p>No webhook endpoints registered.</p>
                    <p className="text-[11px] text-zinc-600">
                      Click &quot;+ Add Endpoint&quot; to configure your first webhook.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              endpoints.map((ep) => (
                <tr key={ep.id} className="hover:bg-zinc-900/40 transition-colors align-top">

                  {/* Name + URL */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white text-xs">{ep.name}</div>
                    <div className="text-zinc-500 text-[11px] truncate mt-0.5" title={ep.url}>
                      {ep.url}
                    </div>
                    {ep.description && (
                      <div className="text-zinc-600 text-[10px] italic mt-0.5 truncate">
                        {ep.description}
                      </div>
                    )}
                    {ep.failureCount > 0 && (
                      <div className="mt-1 text-[10px] text-amber-400 font-semibold">
                        ⚠ {ep.failureCount} failure{ep.failureCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </td>

                  {/* Events — collapse after 2 with "+N more" */}
                  <td className="px-4 py-3">
                    <EventList events={ep.events} max={2} />
                  </td>

                  {/* Status toggle */}
                  <td className="px-4 py-3">
                    <button
                      onClick={() => updateEndpoint(ep.id, { active: !ep.active })}
                      className={`px-2 py-0.5 text-[10px] border uppercase tracking-wider font-bold whitespace-nowrap transition ${
                        ep.active
                          ? 'border-emerald-700 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/40'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600'
                      }`}
                      title={ep.active ? 'Click to disable' : 'Click to enable'}
                    >
                      {ep.active ? '● ACTIVE' : '○ OFF'}
                    </button>
                  </td>

                  {/* Last Delivery */}
                  <td className="px-4 py-3 text-zinc-500 text-[11px]">
                    {ep.lastDeliveryAt ? (
                      <span title={new Date(ep.lastDeliveryAt).toLocaleString()}>
                        {formatRelativeTime(ep.lastDeliveryAt)}
                      </span>
                    ) : (
                      <span className="text-zinc-600 italic">Never</span>
                    )}
                  </td>

                  {/* Actions — always one line */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {/* Primary: Test */}
                      <button
                        onClick={() => handleTestWebhook(ep)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] uppercase border border-zinc-700 tracking-wider transition"
                      >
                        Test
                      </button>
                      {/* Primary: Edit */}
                      <button
                        onClick={() => handleOpenEdit(ep)}
                        className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] uppercase border border-zinc-700 tracking-wider transition"
                      >
                        Edit
                      </button>
                      {/* Secondary: overflow ⋯ menu */}
                      <ActionsMenu
                        ep={ep}
                        onHistory={() => handleViewDeliveries(ep)}
                        onRotate={() => handleRotateSecret(ep)}
                        onDisable={() => handleDisableEndpoint(ep)}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Secret Reveal Modal ── */}
      {revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg border border-emerald-500/50 bg-zinc-950 p-6 space-y-4 font-mono text-zinc-100 shadow-2xl">
            <h2 className="text-base font-bold text-emerald-400 uppercase tracking-wide">
              🔒 Webhook Signing Secret
            </h2>
            <div className="border border-amber-800/80 bg-amber-950/30 p-3 text-xs text-amber-300 space-y-1">
              <strong className="block text-amber-400 uppercase tracking-wider">⚠ Copy now — shown once only</strong>
              <p>
                Use this secret to verify incoming webhook payloads by comparing the{' '}
                <code className="text-white bg-zinc-800 px-1">X-Gami-Signature</code> header
                against <code className="text-white bg-zinc-800 px-1">sha256=&lt;hmac&gt;</code>.
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] uppercase text-zinc-400 tracking-wider">Signing Secret</label>
              <div className="flex items-stretch gap-2">
                <input
                  type="text"
                  readOnly
                  value={revealedSecret}
                  className="flex-1 border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-emerald-300 font-mono min-w-0"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copyToClipboard(revealedSecret)}
                  className={`px-4 py-2 text-xs font-bold uppercase border transition shrink-0 ${
                    copiedSecret
                      ? 'bg-emerald-800 border-emerald-600 text-emerald-200'
                      : 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                  }`}
                >
                  {copiedSecret ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="pt-2 flex justify-end border-t border-zinc-800">
              <button
                onClick={() => setRevealedSecret(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-white px-5 py-2 text-xs uppercase tracking-wider border border-zinc-700"
              >
                I've saved it — Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {(isCreateOpen || editingEndpoint) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl border border-zinc-700 bg-zinc-950 font-mono text-zinc-100 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">
                {editingEndpoint ? `Edit: ${editingEndpoint.name}` : 'New Webhook Endpoint'}
              </h2>
              <button
                onClick={() => { setIsCreateOpen(false); setEditingEndpoint(null); }}
                className="text-zinc-500 hover:text-white text-xs uppercase px-2 py-1 border border-zinc-800 hover:border-zinc-600 transition"
              >
                ✕
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5">
              {formError && (
                <div className="mb-4 border border-red-800 bg-red-950/50 p-3 text-xs text-red-400">
                  {formError}
                </div>
              )}

              <form
                id="webhook-form"
                onSubmit={editingEndpoint ? handleUpdateSubmit : handleCreateSubmit}
                className="space-y-4"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-400 mb-1 tracking-wider">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Production Receiver"
                      className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none transition"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase text-zinc-400 mb-1 tracking-wider">
                      Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Internal notification pipeline"
                      className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 mb-1 tracking-wider">
                    Target URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-api.com/webhooks/gami"
                    className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none transition font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase text-zinc-400 mb-2 tracking-wider">
                    Event Subscriptions <span className="text-red-500">*</span>
                    <span className="text-zinc-600 ml-2 normal-case">({selectedEvents.length} selected)</span>
                  </label>
                  <Checklist<SdkWebhookEventType>
                    items={WEBHOOK_EVENT_ITEMS}
                    selectedValues={selectedEvents}
                    onChange={setSelectedEvents}
                    title="Subscribe Events"
                    showSelectAll
                    showSearch
                    searchPlaceholder="Filter webhook events..."
                    maxHeight="180px"
                  />
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex justify-end gap-2 border-t border-zinc-800 shrink-0">
              <button
                type="button"
                onClick={() => { setIsCreateOpen(false); setEditingEndpoint(null); }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-xs uppercase border border-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="webhook-form"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 text-xs font-bold uppercase disabled:opacity-50 transition"
              >
                {submitting ? 'Saving...' : editingEndpoint ? 'Save Changes' : 'Create Webhook'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delivery History Modal ── */}
      {selectedEndpointForDeliveries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-5xl border border-zinc-800 bg-zinc-950 font-mono text-zinc-100 shadow-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
              <div>
                <h2 className="text-sm font-bold uppercase text-white tracking-wide">
                  Delivery History
                </h2>
                <div className="text-[11px] text-emerald-400 mt-0.5">{selectedEndpointForDeliveries.name}</div>
                <div className="text-[11px] text-zinc-500 truncate max-w-xl">{selectedEndpointForDeliveries.url}</div>
              </div>
              <button
                onClick={() => setSelectedEndpointForDeliveries(null)}
                className="text-zinc-400 hover:text-white text-xs uppercase px-3 py-1.5 border border-zinc-800 hover:border-zinc-600 transition"
              >
                ✕ Close
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left text-xs" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="border-b border-zinc-800 bg-zinc-900 uppercase text-zinc-400 text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Delivery ID</th>
                    <th className="px-4 py-2.5">Event Type</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Attempts</th>
                    <th className="px-4 py-2.5">Last Error</th>
                    <th className="px-4 py-2.5 text-right">Delivered / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {deliveriesLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-3 h-3 border border-orange-500 border-t-transparent animate-spin" />
                          Loading deliveries...
                        </div>
                      </td>
                    </tr>
                  ) : deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                        No delivery logs recorded yet.
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((del) => (
                      <tr key={del.id} className="hover:bg-zinc-900/40 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[10px] text-zinc-400 truncate" title={del.id}>
                          {del.id.slice(0, 16)}…
                        </td>
                        <td className="px-4 py-2.5">
                          <EventPill event={del.eventType as SdkWebhookEventType} />
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`px-1.5 py-0.5 text-[10px] uppercase font-bold border whitespace-nowrap ${
                              del.status === 'delivered'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
                                : del.status === 'failed'
                                ? 'bg-red-950 text-red-400 border-red-700'
                                : 'bg-amber-950 text-amber-300 border-amber-700'
                            }`}
                          >
                            {del.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-300 font-mono">{del.attempts}</td>
                        <td className="px-4 py-2.5 text-red-400 text-[11px] truncate" title={del.lastError || ''}>
                          {del.lastError || <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span
                              className="text-zinc-500 text-[11px] whitespace-nowrap"
                              title={del.deliveredAt ? new Date(del.deliveredAt).toLocaleString() : new Date(del.createdAt).toLocaleString()}
                            >
                              {formatRelativeTime(del.deliveredAt || del.createdAt)}
                            </span>
                            <button
                              onClick={() => handleReplayDelivery(del.id)}
                              className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] uppercase border border-zinc-700 whitespace-nowrap transition"
                            >
                              Replay
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialog (replaces browser confirm()) ── */}
      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmLabel={confirmState?.confirmLabel ?? 'Confirm'}
        confirmClass={confirmState?.confirmClass ?? ''}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
