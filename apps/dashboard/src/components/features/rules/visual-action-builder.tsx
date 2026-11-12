'use client';

/**
 * The shared action builder from packages/ui, with this project's achievements, currencies and
 * plugin actions loaded from the API.
 */
import { useEffect, useState } from 'react';
import { VisualActionBuilder as SharedActionBuilder, type BuilderCurrency, type BuilderPluginAction, type VisualAction } from '@gami/ui/rules';
import { useAchievements } from '@/hooks/use-achievements';
import { apiFetch } from '@/lib/api-client';

export { buildRulesEngineActions, parseRulesEngineActions, type ActionDefinition, type VisualAction } from '@gami/ui/rules';

export interface VisualActionBuilderProps {
  projectId: string | null;
  actions: VisualAction[];
  onChange: (actions: VisualAction[]) => void;
}

export function VisualActionBuilder({ projectId, actions, onChange }: VisualActionBuilderProps) {
  const { achievements } = useAchievements(projectId);
  const [currencies, setCurrencies] = useState<BuilderCurrency[]>([]);
  const [pluginActions, setPluginActions] = useState<BuilderPluginAction[]>([]);

  // Actions that installed plugins add, offered next to the built-in ones.
  useEffect(() => {
    apiFetch('/api/plugins')
      .then((res) => (res.ok ? res.json() : { actions: [] }))
      .then((body: { actions: BuilderPluginAction[] }) => setPluginActions(body.actions ?? []))
      .catch(() => setPluginActions([]));
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    apiFetch(`/api/projects/${projectId}/currencies`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data: (BuilderCurrency & { enabled: boolean })[] }) => {
        if (!cancelled) setCurrencies(body.data.filter((item) => item.enabled));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return (
    <SharedActionBuilder
      actions={actions}
      onChange={onChange}
      achievements={achievements}
      currencies={currencies}
      pluginActions={pluginActions}
      noAchievementsHint="No achievements yet for this project. Create one on the Achievements page first."
    />
  );
}
