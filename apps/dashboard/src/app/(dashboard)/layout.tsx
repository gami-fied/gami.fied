'use client';

import React, { ReactNode } from 'react';
import { DashboardProvider } from '@/components/features/context/dashboard-context';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { ToastProvider } from '@/components/ui/toast';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardProvider>
  );
}
