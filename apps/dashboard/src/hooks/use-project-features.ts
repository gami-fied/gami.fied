'use client';

import { apiFetch } from '@/lib/api-client';
import { useEffect, useState } from 'react';

export interface ProjectFeatures {
  features: Record<string, boolean>;
  disabled: { key: string; name: string }[];
  policy: { apiKeyMaxLifetimeDays: number | null; requireAllowedOrigins: boolean; allowedEmailDomains: string[] };
}

// One request per project per page load, shared by the sidebar, search and page guard.
const cache = new Map<string, Promise<ProjectFeatures | null>>();

function fetchFeatures(projectId: string): Promise<ProjectFeatures | null> {
  if (!cache.has(projectId)) {
    cache.set(
      projectId,
      apiFetch(`/api/projects/${projectId}/features`)
        .then((res) => (res.ok ? (res.json() as Promise<ProjectFeatures>) : null))
        .catch(() => null)
    );
    // Settings change rarely; look again after a minute.
    setTimeout(() => cache.delete(projectId), 60_000);
  }
  return cache.get(projectId)!;
}

/**
 * The features the platform administrator left on for this project's organization. Until it has
 * loaded (or if it fails), everything counts as on, so the dashboard never hides pages by mistake.
 */
export function useProjectFeatures(projectId: string | null | undefined) {
  const [data, setData] = useState<ProjectFeatures | null>(null);

  useEffect(() => {
    if (!projectId) {
      setData(null);
      return;
    }
    let cancelled = false;
    void fetchFeatures(projectId).then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isOn = (feature?: string) => !feature || !data || data.features[feature] !== false;
  return { data, isOn };
}
