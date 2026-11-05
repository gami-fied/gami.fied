'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { useDashboard } from '../features/context/dashboard-context';

interface ProjectAlert {
  id: string;
  title: string;
  href: string;
}

const REFRESH_MS = 60_000;

/** Tells the people running a project what needs attention. */
export function ProjectAlerts() {
  const pathname = usePathname();
  const { selectedProject } = useDashboard();
  const [alerts, setAlerts] = useState<ProjectAlert[]>([]);
  const [open, setOpen] = useState(false);

  const projectId = selectedProject?.id;

  useEffect(() => {
    if (!projectId) return;
    const load = () => {
      apiFetch(`/api/projects/${projectId}/alerts`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => body && setAlerts(body.data))
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [projectId, pathname]);

  const label =
    alerts.length === 0
      ? 'No project alerts'
      : `${alerts.length} project ${alerts.length === 1 ? 'alert' : 'alerts'}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className="relative p-2 text-zinc-400 hover:text-white transition"
      >
        <Bell className="w-4 h-4" />
        {alerts.length > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 border border-zinc-800 bg-zinc-900 p-2 shadow-2xl">
          {alerts.length === 0 && (
            <p className="p-2 text-sm text-zinc-400">Nothing needs your attention.</p>
          )}
          <ul>
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  onClick={() => setOpen(false)}
                  className="block p-2 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  {alert.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
