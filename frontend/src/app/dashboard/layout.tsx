'use client';

/**
 * Dashboard Layout — Sidebar + Header + Content Area.
 *
 * Layout structure:
 *   ┌──────────┬──────────────────────────────────┐
 *   │ Sidebar  │ Header (user info + logout)      │
 *   │ (240px)  ├──────────────────────────────────┤
 *   │          │ Content (scrollable)             │
 *   │          │                                  │
 *   └──────────┴──────────────────────────────────┘
 *
 * The sidebar is fixed-width and fixed-position; the main area scrolls.
 */

import { useState } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { DashboardHeader } from '@/components/layout/header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar collapsed={sidebarCollapsed} />

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <DashboardHeader
          onToggleSidebar={() => setSidebarCollapsed((prev) => !prev)}
        />

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-zinc-50 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
