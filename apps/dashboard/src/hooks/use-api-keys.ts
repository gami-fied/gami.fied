import { useState, useCallback } from 'react';

export interface ApiKeyRecord {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface GeneratedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  rawSecret: string;
}

export function useApiKeys(projectId: string | null) {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchApiKeys = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/api-keys`);
      if (res.ok) {
        setApiKeys(await res.json());
      } else {
        const err = await res.json();
        setError(err.message || 'Failed to load API keys');
      }
    } catch {
      setError('Failed to connect to API server');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const createApiKey = async (name: string): Promise<GeneratedApiKey> => {
    if (!projectId) throw new Error('No project selected');
    const res = await fetch(`/api/projects/${projectId}/api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    if (res.ok) {
      const generatedKey: GeneratedApiKey = await res.json();
      await fetchApiKeys();
      return generatedKey;
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create API key');
    }
  };

  const revokeApiKey = async (keyId: string) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/api-keys/${keyId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      await fetchApiKeys();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to revoke API key');
    }
  };

  return { apiKeys, loading, error, fetchApiKeys, createApiKey, revokeApiKey };
}
