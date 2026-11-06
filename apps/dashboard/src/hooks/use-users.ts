'use client';

import { apiFetch } from '@/lib/api-client';
import { useCallback, useEffect, useState } from 'react';
import type { CreateUserInput, UpdateUserInput, User } from '@gami/types';
import { hasCachedState, useCachedState } from './use-cached-state';

export type UserSort = 'newest' | 'oldest' | 'name';

export function useUsers(
  projectId: string | null,
  initialPage = 1,
  initialLimit = 25,
  initialSearch = '',
  sort: UserSort = 'newest'
) {
  const [users, setUsers] = useCachedState<User[]>(`users:${projectId}`, []);
  const [total, setTotal] = useCachedState(`userTotal:${projectId}`, 0);
  const [page, setPage] = useState(initialPage);
  const [limit, setLimit] = useState(initialLimit);
  const [search, setSearch] = useState(initialSearch);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async (p = page, l = limit, s = search) => {
      if (!projectId) {
        setUsers([]);
        setTotal(0);
        return;
      }

      setLoading(!hasCachedState(`users:${projectId}`));
      setError(null);

      try {
        const query = new URLSearchParams({
          page: String(p),
          limit: String(l),
        });
        if (s.trim()) {
          query.set('search', s.trim());
        }
        query.set('sort', sort);

        const res = await apiFetch(`/api/projects/${projectId}/users?${query.toString()}`, {
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || 'Failed to fetch project users');
        }

        const data = await res.json();
        setUsers(data.users || []);
        setTotal(data.total || 0);
        setPage(data.page || p);
        setLimit(data.limit || l);
      } catch (err: unknown) {
        setError((err as Error).message || 'Failed to fetch users');
      } finally {
        setLoading(false);
      }
    },
    [projectId, page, limit, search, sort, setUsers, setTotal]
  );

  useEffect(() => {
    fetchUsers(initialPage, initialLimit, initialSearch);
  }, [projectId, fetchUsers, initialPage, initialLimit, initialSearch]);

  const createUser = async (input: CreateUserInput) => {
    if (!projectId) throw new Error('No project selected');

    const res = await apiFetch(`/api/projects/${projectId}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to create user');
    }

    const newUser: User = await res.json();
    await fetchUsers();
    return newUser;
  };

  const updateUser = async (userId: string, input: UpdateUserInput) => {
    if (!projectId) throw new Error('No project selected');

    const res = await apiFetch(`/api/projects/${projectId}/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to update user');
    }

    const updatedUser: User = await res.json();
    await fetchUsers();
    return updatedUser;
  };

  const deactivateUser = async (userId: string) => {
    if (!projectId) throw new Error('No project selected');

    const res = await apiFetch(`/api/projects/${projectId}/users/${userId}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to deactivate user');
    }

    await fetchUsers();
  };

  return {
    users,
    total,
    page,
    limit,
    search,
    setSearch,
    setPage,
    loading,
    error,
    refresh: fetchUsers,
    createUser,
    updateUser,
    deactivateUser,
  };
}
