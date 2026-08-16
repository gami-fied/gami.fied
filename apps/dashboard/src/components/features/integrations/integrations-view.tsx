'use client';

import { useEffect, useState } from 'react';
import {
  Blocks,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  Activity,
  History,
  Sliders,
  RotateCcw,
  Sparkles,
  Code,
  ShieldCheck,
  PlusCircle,
  Eye,
  Check,
  Copy,
  Layers,
} from 'lucide-react';
import { useDashboard } from '../context/dashboard-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Checklist, ChecklistItem } from '@/components/ui/checklist';
import type { DiscordEmbedField, DiscordEmbedTemplate, IntegrationDeliveryRecord, IntegrationRecord } from '@gami.fied/sdk';

const EVENT_CHECKLIST_ITEMS: ChecklistItem<string>[] = [
  {
    value: 'xp_awarded',
    label: 'XP Awarded',
    description: 'Triggered whenever an end-user receives XP via rules or manual adjustment.',
    badge: 'XP System',
  },
  {
    value: 'achievement_unlocked',
    label: 'Achievement Unlocked',
    description: 'Triggered when an end-user unlocks a new achievement badge.',
    badge: 'Achievements',
  },
  {
    value: 'level_up',
    label: 'Level Up',
    description: 'Triggered when an end-user crosses a level XP threshold and levels up.',
    badge: 'Progression',
  },
  {
    value: 'challenge_completed',
    label: 'Challenge Completed',
    description: 'Triggered when an end-user completes all target progress requirements for a quest.',
    badge: 'Challenges',
  },
];

const EVENT_TYPES = [
  { id: 'xp_awarded', label: 'XP Awarded', badge: 'XP' },
  { id: 'achievement_unlocked', label: 'Achievement Unlocked', badge: 'Achievement' },
  { id: 'level_up', label: 'Level Up', badge: 'Progression' },
  { id: 'challenge_completed', label: 'Challenge Completed', badge: 'Challenge' },
];

const PLACEHOLDERS: Record<string, Array<{ key: string; description: string }>> = {
  xp_awarded: [
    { key: '{{xp}}', description: 'Amount of XP awarded' },
    { key: '{{currentXp}}', description: 'User total XP balance' },
    { key: '{{currentLevel}}', description: 'User current level number' },
    { key: '{{levelName}}', description: 'Title of current level' },
    { key: '{{xpToNextLevel}}', description: 'XP needed for next level' },
    { key: '{{progressPercent}}', description: 'Level progress %' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  achievement_unlocked: [
    { key: '{{achievementName}}', description: 'Name of unlocked achievement' },
    { key: '{{achievementId}}', description: 'ID of achievement' },
    { key: '{{achievementDescription}}', description: 'Achievement description' },
    { key: '{{badgeIconUrl}}', description: 'Badge icon image URL' },
    { key: '{{unlockedAt}}', description: 'Timestamp of unlock' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  level_up: [
    { key: '{{newLevel}}', description: 'New level number reached' },
    { key: '{{levelName}}', description: 'Title of new level' },
    { key: '{{previousLevel}}', description: 'Previous level number' },
    { key: '{{requiredXp}}', description: 'XP required for level' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
  challenge_completed: [
    { key: '{{challengeName}}', description: 'Name of completed challenge' },
    { key: '{{challengeId}}', description: 'ID of challenge' },
    { key: '{{challengeDescription}}', description: 'Challenge description' },
    { key: '{{rewardXp}}', description: 'Bonus XP reward' },
    { key: '{{userId}}', description: 'Internal user ID' },
    { key: '{{userName}}', description: 'User display name' },
    { key: '{{externalId}}', description: 'External user ID' },
  ],
};

const DEFAULT_TEMPLATES: Record<string, DiscordEmbedTemplate> = {
  xp_awarded: {
    title: '⚡ XP Awarded',
    description: '**{{userName}}** earned **{{xp}} XP**!',
    color: '#F59E0B',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Current Level', value: 'Level {{currentLevel}} ({{levelName}})', inline: true },
      { name: 'Progress', value: '{{progressPercent}} ({{xpToNextLevel}} XP needed)', inline: true },
    ],
  },
  achievement_unlocked: {
    title: '🏆 Achievement Unlocked!',
    description: '🎉 **{{userName}}** unlocked **{{achievementName}}**!',
    color: '#10B981',
    footerText: 'Gami Gamification Engine',
    fields: [{ name: 'Details', value: '{{achievementDescription}}', inline: false }],
  },
  level_up: {
    title: '🎉 Level Up!',
    description: '🚀 **{{userName}}** reached **Level {{newLevel}}**!',
    color: '#06B6D4',
    footerText: 'Gami Gamification Engine',
    fields: [
      { name: 'Title', value: '{{levelName}}', inline: true },
      { name: 'Previous Level', value: 'Level {{previousLevel}}', inline: true },
    ],
  },
  challenge_completed: {
    title: '⚔️ Challenge Completed!',
    description: '⚔️ **{{userName}}** completed **{{challengeName}}**!',
    color: '#8B5CF6',
    footerText: 'Gami Gamification Engine',
    fields: [{ name: 'Reward', value: '+{{rewardXp}} Bonus XP', inline: true }],
  },
};

export function IntegrationsView() {
  const { selectedProject, selectedOrg } = useDashboard();
  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg?.role || 'member');
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Connect Integration Modal State
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [connectName, setConnectName] = useState('Discord Channel Notifications');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delivery History Modal State
  const [activeDeliveryModal, setActiveDeliveryModal] = useState<IntegrationRecord | null>(null);
  const [deliveries, setDeliveries] = useState<IntegrationDeliveryRecord[]>([]);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);

  // Configure Templates & Delivery Controls Modal State
  const [activeConfigModal, setActiveConfigModal] = useState<IntegrationRecord | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'events' | 'template' | 'preview'>('template');
  const [selectedEventTab, setSelectedEventTab] = useState<string>('xp_awarded');
  const [enabledEvents, setEnabledEvents] = useState<string[]>([
    'xp_awarded',
    'achievement_unlocked',
    'level_up',
    'challenge_completed',
  ]);
  const [customTemplates, setCustomTemplates] = useState<Record<string, DiscordEmbedTemplate>>({});
  const [configSaving, setConfigSaving] = useState(false);
  const [configValidationError, setConfigValidationError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProject) {
      fetchIntegrations();
    }
  }, [selectedProject]);

  const fetchIntegrations = async () => {
    if (!selectedProject) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/integrations`);
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to load project integrations');
      }
    } catch {
      setError('Network error fetching integrations');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDiscordIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;

    if (!webhookUrl.trim()) {
      setFormError('Please provide a valid Discord Webhook URL');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/integrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: connectName,
          provider: 'discord',
          webhookUrl: webhookUrl.trim(),
          enabledEvents: ['xp_awarded', 'achievement_unlocked', 'level_up', 'challenge_completed'],
        }),
      });

      if (res.ok) {
        setIsConnectOpen(false);
        setWebhookUrl('');
        await fetchIntegrations();
      } else {
        const err = await res.json().catch(() => ({}));
        setFormError(err.message || 'Failed to create Discord integration');
      }
    } catch {
      setFormError('Network error connecting Discord');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestIntegration = async (intg: IntegrationRecord) => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/integrations/${intg.id}/test`, {
        method: 'POST',
      });
      if (res.ok) {
        alert('Test notification successfully sent to Discord!');
        await fetchIntegrations();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Test Failed: ${err.message || 'Failed to send test notification'}`);
      }
    } catch {
      alert('Network error testing Discord integration');
    }
  };

  const handleToggleEnable = async (intg: IntegrationRecord) => {
    if (!selectedProject) return;
    const action = intg.enabled ? 'disable' : 'enable';
    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${intg.id}/${action}`,
        { method: 'POST' }
      );
      if (res.ok) {
        await fetchIntegrations();
      }
    } catch {
      alert(`Network error toggling integration status`);
    }
  };

  const handleDeleteIntegration = async (intg: IntegrationRecord) => {
    if (!selectedProject) return;
    if (!confirm(`Are you sure you want to disconnect integration "${intg.name}"?`)) return;

    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/integrations/${intg.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchIntegrations();
      }
    } catch {
      alert('Network error deleting integration');
    }
  };

  const openDeliveriesModal = async (intg: IntegrationRecord) => {
    if (!selectedProject) return;
    setActiveDeliveryModal(intg);
    setDeliveriesLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${intg.id}/deliveries`
      );
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch {
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const handleReplayDelivery = async (deliveryId: string) => {
    if (!selectedProject || !activeDeliveryModal) return;
    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${activeDeliveryModal.id}/deliveries/${deliveryId}/replay`,
        { method: 'POST' }
      );
      if (res.ok) {
        alert('Replay delivery intent queued successfully!');
        await openDeliveriesModal(activeDeliveryModal);
      }
    } catch {
      alert('Network error replaying delivery');
    }
  };

  // Open Template Customization & Delivery Control Dialog
  const openConfigModal = async (intg: IntegrationRecord) => {
    if (!selectedProject) return;
    setActiveConfigModal(intg);
    setActiveModalTab('template');
    setConfigValidationError(null);
    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${intg.id}/templates`
      );
      if (res.ok) {
        const data = await res.json();
        setEnabledEvents(data.enabledEvents || ['xp_awarded', 'achievement_unlocked', 'level_up', 'challenge_completed']);
        setCustomTemplates(data.customTemplates || {});
      }
    } catch {
      alert('Error fetching integration templates');
    }
  };

  // Update specific template field in state
  const handleUpdateCurrentTemplateField = (field: keyof DiscordEmbedTemplate, value: any) => {
    const activeTpl = customTemplates[selectedEventTab] || DEFAULT_TEMPLATES[selectedEventTab] || {};
    setCustomTemplates({
      ...customTemplates,
      [selectedEventTab]: {
        ...activeTpl,
        [field]: value,
      },
    });
  };

  // Add field to current embed template
  const handleAddFieldToTemplate = () => {
    const activeTpl = customTemplates[selectedEventTab] || DEFAULT_TEMPLATES[selectedEventTab] || {};
    const existingFields = activeTpl.fields || [];
    handleUpdateCurrentTemplateField('fields', [
      ...existingFields,
      { name: 'Field Name', value: '{{placeholder}}', inline: true },
    ]);
  };

  // Update specific field inside template
  const handleUpdateField = (idx: number, key: keyof DiscordEmbedField, val: any) => {
    const activeTpl = customTemplates[selectedEventTab] || DEFAULT_TEMPLATES[selectedEventTab] || {};
    const fields = [...(activeTpl.fields || [])];
    if (fields[idx]) {
      fields[idx] = { ...fields[idx], [key]: val };
      handleUpdateCurrentTemplateField('fields', fields);
    }
  };

  // Remove field from template
  const handleRemoveField = (idx: number) => {
    const activeTpl = customTemplates[selectedEventTab] || DEFAULT_TEMPLATES[selectedEventTab] || {};
    const fields = (activeTpl.fields || []).filter((_, i) => i !== idx);
    handleUpdateCurrentTemplateField('fields', fields);
  };

  // Reset template back to default
  const handleResetCurrentTemplate = async () => {
    if (!selectedProject || !activeConfigModal) return;
    const newTemplates = { ...customTemplates };
    delete newTemplates[selectedEventTab];
    setCustomTemplates(newTemplates);

    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${activeConfigModal.id}/templates/reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: selectedEventTab }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.integration?.config?.customTemplates) {
          setCustomTemplates(data.integration.config.customTemplates);
        }
      }
    } catch {}
  };

  // Save templates & delivery controls to API
  const handleSaveConfig = async () => {
    if (!selectedProject || !activeConfigModal) return;
    setConfigSaving(true);
    setConfigValidationError(null);

    try {
      const res = await fetch(
        `/api/projects/${selectedProject.id}/integrations/${activeConfigModal.id}/templates`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            enabledEvents,
            customTemplates,
          }),
        }
      );

      if (res.ok) {
        setActiveConfigModal(null);
        await fetchIntegrations();
      } else {
        const err = await res.json().catch(() => ({}));
        setConfigValidationError(err.message || 'Failed to save template customizations');
      }
    } catch {
      setConfigValidationError('Network error saving configuration');
    } finally {
      setConfigSaving(false);
    }
  };

  const copyPlaceholderToClipboard = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const getActiveTemplate = (): DiscordEmbedTemplate => {
    return customTemplates[selectedEventTab] || DEFAULT_TEMPLATES[selectedEventTab] || {};
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono text-xs">
        Please select a project to manage external integrations.
      </div>
    );
  }

  return (
    <div className="space-y-8 font-mono">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Blocks className="w-5 h-5 text-emerald-400" />
            Integrations & External Channels
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Connect project gamification events to external platforms (Discord, Slack, Teams) for{' '}
            <span className="text-emerald-400 font-semibold">{selectedProject.name}</span>.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!isAdminOrOwner}
          title={!isAdminOrOwner ? 'Requires Admin or Owner role to connect integrations' : undefined}
          onClick={() => isAdminOrOwner && setIsConnectOpen(true)}
          className={`text-white ${
            isAdminOrOwner
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}
        >
          <Plus className="w-4 h-4 mr-1" />
          Connect Integration
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Connected Integrations */}
      <div className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          Connected Integrations ({integrations.length})
        </h2>

        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
            Loading project integrations...
          </div>
        ) : integrations.length === 0 ? (
          <Card className="p-8 text-center bg-zinc-950/60 border-zinc-800/80">
            <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-zinc-200">No Integrations Connected</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
              Connect Discord to deliver real-time custom embeds when users earn XP, unlock achievements, or level up.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-4 border-emerald-800 hover:bg-emerald-950/40 text-emerald-300"
              onClick={() => setIsConnectOpen(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Connect Discord
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {integrations.map((intg) => {
              const cfg = (intg.config as Record<string, any>) || {};
              const activeEvents: string[] = (cfg.enabledEvents as string[]) || [];
              const customTplCount = cfg.customTemplates
                ? Object.keys(cfg.customTemplates as Record<string, unknown>).length
                : 0;

              return (
                <Card key={intg.id} className="p-4 bg-zinc-950 border-zinc-800 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-indigo-950/80 border border-indigo-800/60 text-indigo-400 flex items-center justify-center">
                          <MessageSquare className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-zinc-100">{intg.name}</h3>
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wider">
                            Provider: {intg.provider}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {intg.enabled ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 border border-emerald-800 bg-emerald-950/60 text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 border border-zinc-800 bg-zinc-900 text-zinc-500">
                            Disabled
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-zinc-900 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Enabled Delivery Events:</span>
                        <div className="flex flex-wrap gap-1">
                          {EVENT_TYPES.map((ev) => {
                            const isEvEnabled = activeEvents.includes(ev.id);
                            return (
                              <span
                                key={ev.id}
                                className={`text-[9px] px-1.5 py-0.5 border ${
                                  isEvEnabled
                                    ? 'bg-zinc-900 border-zinc-700 text-emerald-400'
                                    : 'bg-zinc-950 border-zinc-900 text-zinc-600 line-through'
                                }`}
                              >
                                {ev.label}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-zinc-400">
                        <span>Custom Embed Templates:</span>
                        <span className="text-emerald-400 font-bold">
                          {customTplCount > 0 ? `${customTplCount} Customized` : 'Using System Defaults'}
                        </span>
                      </div>

                      {intg.lastError && (
                        <p className="text-[11px] text-rose-400 bg-rose-950/30 border border-rose-900 p-2 mt-1">
                          Last Error: {intg.lastError}
                        </p>
                      )}
                    </div>
                  </div>

                    <div className="flex items-center justify-between pt-3 border-t border-zinc-900 gap-2">
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isAdminOrOwner}
                          title={!isAdminOrOwner ? 'Requires Admin or Owner role to configure templates' : undefined}
                          onClick={() => isAdminOrOwner && openConfigModal(intg)}
                          className={`text-xs h-7 px-2.5 font-medium ${
                            isAdminOrOwner
                              ? 'border-emerald-900/60 hover:bg-emerald-950/40 text-emerald-400'
                              : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                          }`}
                        >
                          <Sliders className="w-3 h-3 mr-1 text-emerald-400" />
                          Configure Templates & Events
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isAdminOrOwner}
                          title={!isAdminOrOwner ? 'Requires Admin or Owner role to test integration' : undefined}
                          onClick={() => isAdminOrOwner && handleTestIntegration(intg)}
                          className={`text-xs h-7 px-2.5 ${
                            isAdminOrOwner
                              ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                              : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                          }`}
                        >
                          <Send className="w-3 h-3 mr-1 text-emerald-400" />
                          Test
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => openDeliveriesModal(intg)}
                          className="text-xs h-7 px-2.5 border-zinc-800 hover:bg-zinc-900 text-zinc-300"
                        >
                          <History className="w-3 h-3 mr-1 text-cyan-400" />
                          Logs
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isAdminOrOwner}
                          title={!isAdminOrOwner ? 'Requires Admin or Owner role to toggle integration' : undefined}
                          onClick={() => isAdminOrOwner && handleToggleEnable(intg)}
                          className={`text-xs h-7 px-2.5 ${
                            isAdminOrOwner
                              ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                              : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                          }`}
                        >
                          {intg.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!isAdminOrOwner}
                          title={!isAdminOrOwner ? 'Requires Admin or Owner role to remove integration' : undefined}
                          onClick={() => isAdminOrOwner && handleDeleteIntegration(intg)}
                          className={`text-xs h-7 px-2 ${
                            isAdminOrOwner
                              ? 'border-rose-950 hover:bg-rose-950/40 text-rose-400'
                              : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                          }`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Available Integration Providers */}
      <div className="space-y-4 pt-6 border-t border-zinc-800">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
          <Blocks className="w-4 h-4 text-zinc-400" />
          Available Integration Providers
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Discord */}
          <Card className="p-4 bg-zinc-950 border-zinc-800 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-100">Discord</h3>
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase">
                    Active Provider
                  </span>
                </div>
              </div>
              <p className="text-xs text-zinc-400 mt-3 leading-relaxed">
                Deliver custom Discord embed notifications for XP awards, achievements, level ups, and challenge completions.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsConnectOpen(true)}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Connect Discord
            </Button>
          </Card>

          {/* Slack (Coming Soon) */}
          <Card className="p-4 bg-zinc-950/50 border-zinc-900 flex flex-col justify-between space-y-4 opacity-75">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-300">Slack</h3>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
                Post Gami gamification activity feeds and team leaderboards into Slack channels.
              </p>
            </div>
            <Button disabled variant="secondary" size="sm" className="w-full text-xs opacity-50 cursor-not-allowed">
              Coming Soon
            </Button>
          </Card>

          {/* Microsoft Teams (Coming Soon) */}
          <Card className="p-4 bg-zinc-950/50 border-zinc-900 flex flex-col justify-between space-y-4 opacity-75">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-300">Microsoft Teams</h3>
                    <span className="text-[10px] text-zinc-500 font-semibold uppercase">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-3 leading-relaxed">
                Send adaptive cards and achievement announcements directly to Microsoft Teams channels.
              </p>
            </div>
            <Button disabled variant="secondary" size="sm" className="w-full text-xs opacity-50 cursor-not-allowed">
              Coming Soon
            </Button>
          </Card>
        </div>
      </div>

      {/* Connect Discord Dialog */}
      <Dialog isOpen={isConnectOpen} onClose={() => setIsConnectOpen(false)} title="Connect Discord Integration">
        <form onSubmit={handleCreateDiscordIntegration} className="space-y-4 font-mono text-xs">
          <p className="text-zinc-400 text-xs">
            Configure a Discord Channel Webhook URL to deliver real-time gamification embeds. Credentials are encrypted at rest using AES-256-GCM.
          </p>

          {formError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {formError}
            </div>
          )}

          <Input
            label="Integration Name"
            type="text"
            value={connectName}
            onChange={(e) => setConnectName(e.target.value)}
            placeholder="e.g. Discord Channel Notifications"
            required
          />

          <Input
            label="Discord Webhook URL"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://discord.com/api/webhooks/123456789/abcdef..."
            helperText="Obtain from Discord Server Settings > Integrations > Webhooks."
            required
          />

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsConnectOpen(false)}
              className="border-zinc-800 text-zinc-400"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {isSubmitting ? 'Connecting...' : 'Save & Connect'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Configure Custom Embed Templates & Per-Event Delivery Premium Modal */}
      {activeConfigModal && (
        <Dialog
          isOpen={Boolean(activeConfigModal)}
          onClose={() => setActiveConfigModal(null)}
          title={`Discord Integration Settings — ${activeConfigModal.name}`}
        >
          <div className="space-y-5 font-mono text-xs max-h-[80vh] overflow-y-auto pr-1">
            {configValidationError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                {configValidationError}
              </div>
            )}

            {/* Modal Sub-Header Tabs */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveModalTab('template')}
                  className={`px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    activeModalTab === 'template'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Embed Templates & Fields
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('events')}
                  className={`px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    activeModalTab === 'events'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  Delivery Events ({enabledEvents.length}/4)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModalTab('preview')}
                  className={`px-3 py-1.5 text-xs font-bold transition flex items-center gap-1.5 ${
                    activeModalTab === 'preview'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/80'
                      : 'text-zinc-400 hover:text-zinc-200 border border-transparent'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-cyan-400" />
                  Live Preview & Placeholders
                </button>
              </div>

              {activeModalTab === 'template' && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResetCurrentTemplate}
                  className="text-xs h-7 px-2 border-zinc-800 hover:bg-zinc-800 text-zinc-400"
                >
                  <RotateCcw className="w-3 h-3 mr-1 text-zinc-400" />
                  Reset
                </Button>
              )}
            </div>

            {/* TAB 1: DELIVERY EVENTS CHECKLIST */}
            {activeModalTab === 'events' && (
              <div className="space-y-3 py-1">
                <div className="p-3 bg-zinc-900/60 border border-zinc-800/80 text-zinc-300 text-xs">
                  Select which gamification events automatically create and send Discord notifications. Unchecked events are ignored without interrupting in-app notifications.
                </div>
                <Checklist<string>
                  title="SUPPORTED NOTIFICATION EVENTS"
                  items={EVENT_CHECKLIST_ITEMS}
                  selectedValues={enabledEvents}
                  onChange={(newVals) => setEnabledEvents(newVals)}
                  showSelectAll={true}
                  showSearch={false}
                  maxHeight="260px"
                />
              </div>
            )}

            {/* TAB 2: EMBED TEMPLATES & DYNAMIC FIELDS */}
            {activeModalTab === 'template' && (
              <div className="space-y-4">
                {/* Event Selector Sub-Tabs */}
                <div className="flex border-b border-zinc-800 gap-1">
                  {EVENT_TYPES.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setSelectedEventTab(ev.id)}
                      className={`px-3 py-2 text-xs font-bold transition border-b-2 ${
                        selectedEventTab === ev.id
                          ? 'border-emerald-400 text-emerald-400 bg-emerald-950/20'
                          : 'border-transparent text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {ev.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Basic Embed Config */}
                  <div className="space-y-3">
                    <Input
                      label="Embed Title"
                      type="text"
                      value={getActiveTemplate().title || ''}
                      onChange={(e) => handleUpdateCurrentTemplateField('title', e.target.value)}
                      placeholder="e.g. ⚡ XP Awarded!"
                    />

                    <Textarea
                      label="Embed Description"
                      rows={3}
                      value={getActiveTemplate().description || ''}
                      onChange={(e) => handleUpdateCurrentTemplateField('description', e.target.value)}
                      placeholder="e.g. **{{userName}}** earned **{{xp}} XP**!"
                      helperText="Supports Discord markdown formatting and placeholders."
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="Accent Hex Color"
                        type="text"
                        value={String(getActiveTemplate().color || '#F59E0B')}
                        onChange={(e) => handleUpdateCurrentTemplateField('color', e.target.value)}
                        placeholder="#10B981"
                      />
                      <Input
                        label="Footer Text"
                        type="text"
                        value={getActiveTemplate().footerText || ''}
                        onChange={(e) => handleUpdateCurrentTemplateField('footerText', e.target.value)}
                        placeholder="Gami Engine"
                      />
                    </div>
                  </div>

                  {/* Embed Custom Fields Box List (High-Readability Vertically Stacked Cards) */}
                  <div className="space-y-3 bg-zinc-950/60 border border-zinc-800 p-3">
                    <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-400" />
                        Custom Embed Fields ({(getActiveTemplate().fields || []).length})
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleAddFieldToTemplate}
                        className="text-[11px] h-6 px-2 border-emerald-800/80 hover:bg-emerald-950/40 text-emerald-400 font-medium"
                      >
                        <PlusCircle className="w-3 h-3 mr-1" /> Add Field
                      </Button>
                    </div>

                    {(getActiveTemplate().fields || []).length === 0 ? (
                      <p className="text-[11px] text-zinc-500 text-center py-6">
                        No custom fields configured for this template. Click "Add Field" to add key-value metadata.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                        {(getActiveTemplate().fields || []).map((f, idx) => (
                          <div key={idx} className="p-3 bg-zinc-950/80 border border-zinc-800 space-y-3">
                            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <span className="w-4 h-4 bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] flex items-center justify-center font-bold">
                                  {idx + 1}
                                </span>
                                Field #{idx + 1}
                              </span>

                              <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1.5 text-[11px] text-zinc-400 cursor-pointer hover:text-zinc-200">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(f.inline)}
                                    onChange={(e) => handleUpdateField(idx, 'inline', e.target.checked)}
                                    className="rounded-none border-zinc-700 text-emerald-500 focus:ring-0 bg-zinc-900"
                                  />
                                  <span>Display Inline</span>
                                </label>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleRemoveField(idx)}
                                  className="h-6 px-2 border-rose-950/80 hover:bg-rose-950/40 text-rose-400 text-[10px]"
                                >
                                  <Trash2 className="w-3 h-3 mr-1" /> Remove
                                </Button>
                              </div>
                            </div>

                            <div className="space-y-2.5">
                              <Input
                                label="Field Label / Title"
                                type="text"
                                value={f.name}
                                onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                                placeholder="e.g. Current Level"
                                className="w-full text-xs"
                              />

                              <Input
                                label="Field Value / Content"
                                type="text"
                                value={f.value}
                                onChange={(e) => handleUpdateField(idx, 'value', e.target.value)}
                                placeholder="e.g. Level {{currentLevel}} ({{levelName}})"
                                helperText="Supports placeholders such as {{currentLevel}} or {{xpToNextLevel}}."
                                className="w-full text-xs"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: LIVE PREVIEW & EXPANDED PLACEHOLDERS */}
            {activeModalTab === 'preview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-1">
                {/* Left: Expanded Placeholders Glossary */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Code className="w-3.5 h-3.5 text-emerald-400" />
                      Placeholders for {EVENT_TYPES.find((e) => e.id === selectedEventTab)?.label}
                    </span>
                    <span className="text-[10px] text-zinc-500">Click token to copy</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {(PLACEHOLDERS[selectedEventTab] || []).map((ph) => (
                      <div
                        key={ph.key}
                        onClick={() => copyPlaceholderToClipboard(ph.key)}
                        className="p-2 bg-zinc-900 border border-zinc-800 hover:border-emerald-700 transition cursor-pointer flex items-center justify-between"
                      >
                        <div>
                          <code className="text-emerald-400 font-mono text-xs font-bold">{ph.key}</code>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{ph.description}</p>
                        </div>

                        <div className="text-zinc-500 hover:text-zinc-200">
                          {copiedKey === ph.key ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right: Discord Embed Live Preview Box */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Rendered Discord Embed Preview
                  </span>

                  <div className="p-4 bg-[#2f3136] rounded border border-zinc-700 text-zinc-200 font-sans space-y-2 shadow-inner">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                        G
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white">Gami Bot</span>
                        <span className="text-[9px] bg-indigo-600 text-white px-1 py-0.2 rounded ml-1.5 font-mono">
                          BOT
                        </span>
                      </div>
                    </div>

                    {/* Discord Embed Container */}
                    <div
                      className="p-3 bg-[#2f3136] border-l-4 rounded-r space-y-2"
                      style={{
                        borderLeftColor:
                          typeof getActiveTemplate().color === 'string'
                            ? (getActiveTemplate().color as string)
                            : '#F59E0B',
                      }}
                    >
                      <h4 className="text-sm font-bold text-white">
                        {getActiveTemplate().title || 'Title Preview'}
                      </h4>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                        {(getActiveTemplate().description || 'Description Preview')
                          .replace(/\{\{userName\}\}/g, 'Ronak')
                          .replace(/\{\{xp\}\}/g, '150')
                          .replace(/\{\{currentXp\}\}/g, '1250')
                          .replace(/\{\{currentLevel\}\}/g, '5')
                          .replace(/\{\{levelName\}\}/g, 'Veteran Adventurer')
                          .replace(/\{\{xpToNextLevel\}\}/g, '250')
                          .replace(/\{\{progressPercent\}\}/g, '83%')
                          .replace(/\{\{achievementName\}\}/g, 'First Victory')
                          .replace(/\{\{achievementDescription\}\}/g, 'Awarded for completing campaign mission.')
                          .replace(/\{\{newLevel\}\}/g, '6')
                          .replace(/\{\{previousLevel\}\}/g, '5')
                          .replace(/\{\{challengeName\}\}/g, 'Weekly Warrior')
                          .replace(/\{\{rewardXp\}\}/g, '500')
                          .replace(/\{\{userId\}\}/g, 'usr_123')}
                      </p>

                      {/* Embed Fields Preview */}
                      {getActiveTemplate().fields && getActiveTemplate().fields!.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-700/60">
                          {getActiveTemplate().fields!.map((f, idx) => (
                            <div key={idx} className={f.inline ? 'col-span-1' : 'col-span-2'}>
                              <div className="text-[11px] font-bold text-zinc-400">{f.name}</div>
                              <div className="text-xs text-zinc-200">
                                {f.value
                                  .replace(/\{\{userName\}\}/g, 'Ronak')
                                  .replace(/\{\{xp\}\}/g, '150')
                                  .replace(/\{\{currentLevel\}\}/g, '5')
                                  .replace(/\{\{levelName\}\}/g, 'Veteran Adventurer')
                                  .replace(/\{\{xpToNextLevel\}\}/g, '250')
                                  .replace(/\{\{progressPercent\}\}/g, '83%')
                                  .replace(/\{\{achievementDescription\}\}/g, 'Awarded for completing campaign.')
                                  .replace(/\{\{previousLevel\}\}/g, '5')
                                  .replace(/\{\{rewardXp\}\}/g, '500')}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {getActiveTemplate().footerText && (
                        <div className="pt-2 border-t border-zinc-700/50 text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                          {getActiveTemplate().footerText} • Today at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setActiveConfigModal(null)}
                className="border-zinc-800 text-zinc-400"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleSaveConfig}
                disabled={configSaving}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
              >
                {configSaving ? 'Saving Changes...' : 'Save Configuration & Templates'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Delivery Logs Modal */}
      {activeDeliveryModal && (
        <Dialog
          isOpen={Boolean(activeDeliveryModal)}
          onClose={() => setActiveDeliveryModal(null)}
          title={`Delivery History — ${activeDeliveryModal.name}`}
        >
          <div className="space-y-4 font-mono text-xs max-h-[70vh] overflow-y-auto">
            {deliveriesLoading ? (
              <div className="py-8 text-center text-zinc-500">Loading delivery history...</div>
            ) : deliveries.length === 0 ? (
              <div className="py-8 text-center text-zinc-500">No delivery logs found.</div>
            ) : (
              <div className="space-y-2">
                {deliveries.map((del) => (
                  <div
                    key={del.id}
                    className="p-3 bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-zinc-200">{del.eventType}</span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 border ${
                            del.status === 'completed'
                              ? 'border-emerald-800 bg-emerald-950/60 text-emerald-400'
                              : del.status === 'failed'
                              ? 'border-rose-800 bg-rose-950/60 text-rose-400'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                          }`}
                        >
                          {del.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500 mt-1">
                        Attempts: {del.attempts} | {new Date(del.createdAt).toLocaleString()}
                        {del.replayedAt && ` (Replayed: ${new Date(del.replayedAt).toLocaleString()})`}
                      </p>
                      {del.lastError && (
                        <p className="text-[10px] text-rose-400 mt-1 font-mono">{del.lastError}</p>
                      )}
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleReplayDelivery(del.id)}
                      className="text-xs h-7 px-2 border-zinc-800 hover:bg-zinc-800 text-cyan-400"
                    >
                      <RefreshCw className="w-3 h-3 mr-1" /> Replay
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
