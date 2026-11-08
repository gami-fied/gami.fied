'use client';

import { ConfirmDialog, Dialog } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/format';
import { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useWebhooks } from '@/hooks/use-webhooks';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import type {
  SdkWebhookEventType,
  WebhookDeliveryRecord,
  WebhookEndpointRecord,
} from '@gami.fied/sdk';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';

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
    description:
      'Triggered when a user satisfies all target progress requirements for a challenge.',
    badge: 'Challenge',
  },
  {
    value: 'reward.redeemed',
    label: 'reward.redeemed',
    description: 'When someone buys a reward. Use it to ship the item or send the code.',
    badge: 'Store',
  },
  {
    value: 'reward.cancelled',
    label: 'reward.cancelled',
    description: 'When a purchase is cancelled and the points are refunded.',
    badge: 'Store',
  },
  {
    value: 'user.created',
    label: 'user.created',
    description: 'When a new user is created.',
    badge: 'User',
  },
  {
    value: 'user.deactivated',
    label: 'user.deactivated',
    description: 'When a user is deactivated.',
    badge: 'User',
  },
];

// Event type → color mapping for consistent pill colors
const EVENT_COLOR: Record<string, string> = {
  'xp.awarded': 'bg-brand-950/60 text-brand-300 border-brand-800/60',
  'achievement.unlocked': 'bg-info-950/60 text-info-300 border-info-800/60',
  'level.up': 'bg-warning-950/60 text-warning-300 border-warning-800/60',
  'challenge.completed': 'bg-info-950/60 text-info-300 border-info-800/60',
  'reward.redeemed': 'bg-brand-950/60 text-brand-300 border-brand-800/60',
  'reward.cancelled': 'bg-zinc-800 text-zinc-400 border-zinc-700',
  'user.created': 'bg-success-950/60 text-success-300 border-success-800/60',
  'user.deactivated': 'bg-zinc-800 text-zinc-400 border-zinc-700',
};

function EventPill({ event }: { event: SdkWebhookEventType }) {
  const color = EVENT_COLOR[event] ?? 'bg-zinc-800 text-zinc-400 border-zinc-700';
  return (
    <span
      className={`inline-block border px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${color}`}
    >
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
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="text-xs text-zinc-400 hover:text-brand-400 transition border border-zinc-700 px-1.5 py-0.5 bg-zinc-900 whitespace-nowrap"
        >
          +{overflow} more
        </button>
      )}
      {expanded && overflow > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(false);
          }}
          className="text-xs text-zinc-400 hover:text-brand-400 transition border border-zinc-700 px-1.5 py-0.5 bg-zinc-900 whitespace-nowrap"
        >
          show less
        </button>
      )}
    </div>
  );
}

// Compact overflow menu for secondary row actions
function ActionsMenu({
  onHistory,
  onRotate,
  onDisable,
}: {
  onHistory: () => void;
  onRotate: () => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700"
        title="More actions"
      >
        ⋯
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="animate-pop fixed right-4 sm:right-16 mt-1 z-50 bg-zinc-900 border border-zinc-800 shadow-xl min-w-[180px] flex flex-col py-1">
            <button
              onClick={() => {
                setOpen(false);
                onHistory();
              }}
              className="px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
            >
              Delivery history
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onRotate();
              }}
              className="px-3 py-2 text-left text-xs text-warning-300 hover:bg-warning-950/40 hover:text-warning-200 transition"
            >
              Rotate secret
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onDisable();
              }}
              className="px-3 py-2 text-left text-xs text-danger-400 hover:bg-danger-950/40 hover:text-danger-300 transition"
            >
              Disable endpoint
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function WebhooksView() {
  const { selectedProject } = useDashboard();
  const {
    endpoints,
    loading,
    error,
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
      const res = await createEndpoint({
        name,
        url,
        description: description || undefined,
        events: selectedEvents,
      });
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
      await updateEndpoint(editingEndpoint.id, {
        name,
        url,
        description: description || undefined,
        events: selectedEvents,
      });
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
      'bg-warning-600 hover:bg-warning-500 text-on-accent border border-warning-500',
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
      'bg-danger-800 hover:bg-danger-700 text-on-accent border border-danger-700',
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
      <div className="p-8 text-center text-zinc-400">
        Please select a project to manage webhooks.
      </div>
    );
  }

  return (
    <div className="space-y-6 text-zinc-100">
      {/* Toast / Alert Banner */}
      {alertMsg && (
        <div
          className={`flex items-center justify-between px-4 py-3 text-xs border ${
            alertMsg.type === 'success'
              ? 'bg-success-950/50 border-success-700/60 text-success-300'
              : 'bg-danger-950/50 border-danger-700/60 text-danger-300'
          }`}
        >
          <span>{alertMsg.msg}</span>
          <button
            onClick={() => setAlertMsg(null)}
            className="text-zinc-400 hover:text-white ml-4 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Webhooks"
        description={
          <>
            Tell your own systems when something happens in{' '}
            <span className="text-zinc-200">{selectedProject.name}</span>.
          </>
        }
        actions={
          <>
            <button
              onClick={() => handleOpenCreate()}
              className={`shrink-0 px-4 py-2 text-xs font-semibold transition-colors ${'bg-success-600 hover:bg-success-500 text-on-accent'}`}
            >
              + Add Endpoint
            </button>
          </>
        }
      />

      {error && (
        <div className="border border-danger-800 bg-danger-950/40 p-4 text-xs text-danger-400">
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

          <thead className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs">
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
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-3 h-3 border border-brand-500 border-t-transparent animate-spin" />
                    Loading webhook endpoints...
                  </div>
                </td>
              </tr>
            ) : endpoints.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-zinc-400">
                  <p>No webhooks yet.</p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Add one to tell your own systems when something happens.
                  </p>
                </td>
              </tr>
            ) : (
              endpoints.map((ep) => (
                <tr key={ep.id} className="hover:bg-zinc-900/40 transition-colors align-top">
                  {/* Name + URL */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white text-xs">{ep.name}</div>
                    <div className="text-zinc-400 text-[11px] truncate mt-0.5" title={ep.url}>
                      {ep.url}
                    </div>
                    {ep.description && (
                      <div className="text-zinc-400 text-xs italic mt-0.5 truncate">
                        {ep.description}
                      </div>
                    )}
                    {ep.failureCount > 0 && (
                      <div className="mt-1 text-xs text-warning-400 font-semibold">
                        ⚠ {ep.failureCount} failure{ep.failureCount !== 1 ? 's' : ''}
                      </div>
                    )}
                    {ep.disabledReason && (
                      <div className="mt-1 text-xs text-danger-400 font-semibold">
                        {ep.disabledReason}
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
                      title={ep.active ? 'Click to disable' : 'Click to enable'}
                      onClick={() => updateEndpoint(ep.id, { active: !ep.active })}
                      className={`px-2 py-0.5 text-xs border font-bold whitespace-nowrap transition ${
                        ep.active
                          ? 'border-success-700 bg-success-950/40 text-success-400 hover:bg-success-900/40'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {ep.active ? '● ACTIVE' : '○ OFF'}
                    </button>
                  </td>

                  {/* Last Delivery */}
                  <td className="px-4 py-3 text-zinc-400 text-[11px]">
                    {ep.lastDeliveryAt ? (
                      <span title={formatDateTime(ep.lastDeliveryAt)}>
                        {formatRelativeTime(ep.lastDeliveryAt)}
                      </span>
                    ) : (
                      <span className="text-zinc-400 italic">Never</span>
                    )}
                  </td>

                  {/* Actions — always one line */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                      {/* Primary: Test */}
                      <button
                        onClick={() => handleTestWebhook(ep)}
                        className={`px-2.5 py-1 bg-zinc-800 text-xs border border-zinc-700 transition ${'hover:bg-zinc-700 text-zinc-200'}`}
                      >
                        Test
                      </button>
                      {/* Primary: Edit */}
                      <button
                        onClick={() => handleOpenEdit(ep)}
                        className={`px-2.5 py-1 bg-zinc-800 text-xs border border-zinc-700 transition ${'hover:bg-zinc-700 text-zinc-200'}`}
                      >
                        Edit
                      </button>
                      {/* Secondary: overflow ⋯ menu */}
                      <ActionsMenu
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
        <Dialog
          isOpen
          onClose={() => setRevealedSecret(null)}
          title="Webhook signing secret"
          maxWidth="lg"
          footer={
            <>
              <Button onClick={() => setRevealedSecret(null)}>I&apos;ve saved it</Button>
            </>
          }
        >
          <div className="border border-warning-800/80 bg-warning-950/30 p-3 text-xs text-warning-300 space-y-1">
            <strong className="block text-warning-400">⚠ Copy now — shown once only</strong>
            <p>
              Use this secret to verify incoming webhook payloads by comparing the{' '}
              <code className="text-white bg-zinc-800 px-1">X-Gami-Signature</code> header against{' '}
              <code className="text-white bg-zinc-800 px-1">sha256=&lt;hmac&gt;</code>.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Signing Secret</label>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                readOnly
                value={revealedSecret}
                className="flex-1 border border-zinc-700 bg-zinc-900 p-2.5 text-xs text-success-300 focus:border-brand-500 min-w-0"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => copyToClipboard(revealedSecret)}
                className={`px-4 py-2 text-xs font-bold border transition shrink-0 ${
                  copiedSecret
                    ? 'bg-success-800 border-success-600 text-success-200'
                    : 'bg-success-600 hover:bg-success-500 border-success-500 text-on-accent'
                }`}
              >
                {copiedSecret ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {/* ── Create / Edit Modal ── */}
      {(isCreateOpen || editingEndpoint) && (
        <Dialog
          isOpen
          onClose={() => {
            setIsCreateOpen(false);
            setEditingEndpoint(null);
          }}
          title={editingEndpoint ? `Edit ${editingEndpoint.name}` : 'New webhook'}
          maxWidth="2xl"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCreateOpen(false);
                  setEditingEndpoint(null);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" form="webhook-form" isLoading={submitting}>
                {editingEndpoint ? 'Save changes' : 'Create webhook'}
              </Button>
            </>
          }
        >
          {formError && (
            <div className="mb-4 border border-danger-800 bg-danger-950/50 p-3 text-xs text-danger-400">
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
                <label htmlFor="webhooks-view-name" className="block text-xs text-zinc-400 mb-1">
                  Name <span className="text-danger-500">*</span>
                </label>
                <input
                  id="webhooks-view-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Production Receiver"
                  className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-brand-500 focus:outline-none transition"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="webhooks-view-description"
                  className="block text-xs text-zinc-400 mb-1"
                >
                  Description
                </label>
                <input
                  id="webhooks-view-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Internal notification pipeline"
                  className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-brand-500 focus:outline-none transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="webhooks-view-target-url"
                className="block text-xs text-zinc-400 mb-1"
              >
                Target URL <span className="text-danger-500">*</span>
              </label>
              <input
                id="webhooks-view-target-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-api.com/webhooks/gami"
                className="w-full border border-zinc-800 bg-zinc-900 p-2.5 text-xs text-white focus:border-brand-500 focus:outline-none transition"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-2">
                Event Subscriptions <span className="text-danger-500">*</span>
                <span className="text-zinc-400 ml-2 normal-case">
                  ({selectedEvents.length} selected)
                </span>
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
        </Dialog>
      )}

      {/* ── Delivery History Modal ── */}
      {selectedEndpointForDeliveries && (
        <Dialog
          isOpen
          onClose={() => setSelectedEndpointForDeliveries(null)}
          title="Delivery history"
          description={`${selectedEndpointForDeliveries.name}: ${selectedEndpointForDeliveries.url}`}
          maxWidth="5xl"
        >
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[48rem] text-left text-xs"
              style={{ tableLayout: 'fixed' }}
            >
              <colgroup>
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 text-xs sticky top-0">
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
                    <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-3 h-3 border border-brand-500 border-t-transparent animate-spin" />
                        Loading deliveries...
                      </div>
                    </td>
                  </tr>
                ) : deliveries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-zinc-400">
                      No delivery logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  deliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-zinc-900/40 transition-colors">
                      <td
                        className="px-4 py-2.5 font-mono text-xs text-zinc-400 truncate"
                        title={del.id}
                      >
                        {del.id.slice(0, 16)}…
                      </td>
                      <td className="px-4 py-2.5">
                        <EventPill event={del.eventType as SdkWebhookEventType} />
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`px-1.5 py-0.5 text-xs font-bold border whitespace-nowrap ${
                            del.status === 'delivered'
                              ? 'bg-success-950 text-success-400 border-success-700'
                              : del.status === 'failed'
                                ? 'bg-danger-950 text-danger-400 border-danger-700'
                                : 'bg-warning-950 text-warning-300 border-warning-700'
                          }`}
                        >
                          {del.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-zinc-300">{del.attempts}</td>
                      <td
                        className="px-4 py-2.5 text-danger-400 text-[11px] truncate"
                        title={del.lastError || ''}
                      >
                        {del.lastError || <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span
                            className="text-zinc-400 text-[11px] whitespace-nowrap"
                            title={
                              del.deliveredAt
                                ? formatDateTime(del.deliveredAt)
                                : formatDateTime(del.createdAt)
                            }
                          >
                            {formatRelativeTime(del.deliveredAt || del.createdAt)}
                          </span>
                          <button
                            onClick={() => handleReplayDelivery(del.id)}
                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 whitespace-nowrap transition"
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
        </Dialog>
      )}

      <ConfirmDialog
        isOpen={!!confirmState}
        title={confirmState?.title ?? ''}
        message={confirmState?.message ?? ''}
        confirmText={confirmState?.confirmLabel ?? 'Confirm'}
        isDanger={confirmState?.confirmClass.includes('danger')}
        onConfirm={confirmState?.onConfirm ?? (() => {})}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
}
