'use client';

import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth-client';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
}

interface DashboardContextType {
  session: ReturnType<typeof authClient.useSession>['data'];
  isPending: boolean;
  organizations: Organization[];
  selectedOrg: Organization | null;
  setSelectedOrg: (org: Organization | null) => void;
  projects: Project[];
  selectedProject: Project | null;
  setSelectedProject: (project: Project | null) => void;
  fetchOrganizations: () => Promise<Organization[]>;
  fetchProjects: (orgId: string) => Promise<Project[]>;
  createOrganization: (name: string, slug: string) => Promise<Organization>;
  createProject: (orgId: string, name: string, slug: string) => Promise<Project>;
  logout: () => Promise<void>;
  error: string | null;
  setError: (err: string | null) => void;
  loadingOrgs: boolean;
  loadingProjects: boolean;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const { data: session, isPending } = authClient.useSession();
  const router = useRouter();

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  const [loadingOrgs, setLoadingOrgs] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep a stable ref of current selected IDs to avoid unnecessary object reference updates
  const selectedOrgIdRef = useRef<string | null>(null);
  const selectedProjectIdRef = useRef<string | null>(null);

  selectedOrgIdRef.current = selectedOrg?.id || null;
  selectedProjectIdRef.current = selectedProject?.id || null;

  // Unauthenticated user redirect protection
  useEffect(() => {
    if (!isPending && session === null) {
      router.replace('/login');
    }
  }, [session, isPending, router]);

  // Fetch organizations only when the authenticated user ID changes
  const userId = session?.user?.id;
  useEffect(() => {
    if (userId) {
      fetchOrganizations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const fetchOrganizations = async (): Promise<Organization[]> => {
    setLoadingOrgs(true);
    try {
      const res = await fetch('/api/organizations', { credentials: 'include' });
      if (res.ok) {
        const data: Organization[] = await res.json();
        setOrganizations(data);

        if (data.length > 0) {
          const currentId = selectedOrgIdRef.current;
          const matchingOrg = currentId ? data.find((o) => o.id === currentId) : null;
          const targetOrg = matchingOrg || data[0] || null;

          // Preserve reference if ID hasn't changed
          setSelectedOrg((prev) => {
            if (prev && targetOrg && prev.id === targetOrg.id) return prev;
            return targetOrg;
          });

          if (targetOrg) {
            await fetchProjects(targetOrg.id);
          }
        } else {
          setSelectedOrg(null);
          setProjects([]);
          setSelectedProject(null);
        }
        return data;
      }
    } catch {
      setError('Failed to fetch organizations');
    } finally {
      setLoadingOrgs(false);
    }
    return [];
  };

  const fetchProjects = async (orgId: string): Promise<Project[]> => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`/api/projects?organizationId=${orgId}`, { credentials: 'include' });
      if (res.ok) {
        const data: Project[] = await res.json();
        setProjects(data);

        if (data.length > 0) {
          const currentId = selectedProjectIdRef.current;
          const matchingProject = currentId ? data.find((p) => p.id === currentId) : null;
          const targetProject = matchingProject || data[0] || null;

          // Preserve reference if ID hasn't changed to prevent modal resets on tab switch
          setSelectedProject((prev) => {
            if (prev && targetProject && prev.id === targetProject.id) return prev;
            return targetProject;
          });
        } else {
          setSelectedProject(null);
        }
        return data;
      }
    } catch {
      setError('Failed to fetch projects');
    } finally {
      setLoadingProjects(false);
    }
    return [];
  };

  const createOrganization = async (name: string, slug: string): Promise<Organization> => {
    const res = await fetch('/api/organizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name, slug }),
    });

    if (res.ok) {
      const data = await res.json();
      const newOrg: Organization = {
        ...data,
        role: data.role || 'owner',
      };
      setOrganizations((prev) => [...prev, newOrg]);
      setSelectedOrg(newOrg);
      setProjects([]);
      setSelectedProject(null);
      await fetchProjects(newOrg.id);
      return newOrg;
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create organization');
    }
  };

  const createProject = async (orgId: string, name: string, slug: string): Promise<Project> => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ organizationId: orgId, name, slug }),
    });

    if (res.ok) {
      const newPrj: Project = await res.json();
      setProjects((prev) => [...prev, newPrj]);
      setSelectedProject(newPrj);
      return newPrj;
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to create project');
    }
  };

  const logout = async () => {
    await authClient.signOut();
    router.replace('/login');
  };

  return (
    <DashboardContext.Provider
      value={{
        session,
        isPending,
        organizations,
        selectedOrg,
        setSelectedOrg: (org) => {
          setSelectedOrg(org);
          if (org) fetchProjects(org.id);
        },
        projects,
        selectedProject,
        setSelectedProject,
        fetchOrganizations,
        fetchProjects,
        createOrganization,
        createProject,
        logout,
        error,
        setError,
        loadingOrgs,
        loadingProjects,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
