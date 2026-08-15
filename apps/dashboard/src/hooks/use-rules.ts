import { useState, useCallback, useEffect } from 'react';

export interface RuleRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: Record<string, unknown> | null;
  actions: Array<Record<string, unknown>>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useRules(projectId: string | null) {
  const [rules, setRules] = useState<RuleRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/rules`);
      if (res.ok) {
        const json = await res.json();
        setRules(json.data || []);
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to load rules');
      }
    } catch {
      setError('Error fetching rules');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchRules();
    }
  }, [projectId, fetchRules]);

  const createRule = async (data: {
    name: string;
    description?: string;
    trigger: string;
    conditions?: Record<string, unknown>;
    actions: Array<Record<string, unknown>>;
    enabled?: boolean;
  }) => {
    if (!projectId) return null;
    const res = await fetch(`/api/projects/${projectId}/rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      await fetchRules();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create rule');
    }
  };

  const updateRule = async (
    ruleId: string,
    patch: Partial<{
      name: string;
      description: string | null;
      trigger: string;
      conditions: Record<string, unknown> | null;
      actions: Array<Record<string, unknown>>;
      enabled: boolean;
    }>
  ) => {
    if (!projectId) return null;
    const res = await fetch(`/api/projects/${projectId}/rules/${ruleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      await fetchRules();
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to update rule');
    }
  };

  const deleteRule = async (ruleId: string) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/rules/${ruleId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      await fetchRules();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to delete rule');
    }
  };

  const previewRule = async (rulePayload: unknown, eventPayload: unknown) => {
    if (!projectId) return null;
    const res = await fetch(`/api/projects/${projectId}/rules/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rule: rulePayload,
        event: eventPayload,
      }),
    });
    if (res.ok) {
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Rule preview failed');
    }
  };

  return { rules, loading, error, fetchRules, createRule, updateRule, deleteRule, previewRule };
}
