/**
 * Dashboard Sidebar — Phase 4 Final: 11 enabled, 4 disabled (Q3 2026).
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, BarChart3, Scale, BookOpen,
  FolderOpen, Factory, Radio, Search, Link as LinkIcon,
  Target, TrendingUp, Settings, Layers, Waypoints,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import type { NavGroup } from '@/lib/types';

type SidebarProps = { collapsed: boolean };

const navGroups: NavGroup[] = [
  {
    label: '总览',
    items: [
      { icon: LayoutDashboard, label: '运营仪表盘', href: '/dashboard' },
      { icon: Users, label: '客户管理', href: '/dashboard/clients' },
    ],
  },
  {
    label: '核心链路',
    items: [
      { icon: BarChart3, label: '诊断报告', href: '/dashboard/diagnosis', disabled: true },
      { icon: Scale, label: '五维评分', href: '/dashboard/scoring' },
      { icon: BookOpen, label: '知识库 + RAG', href: '/dashboard/knowledge' },
      { icon: FolderOpen, label: 'AI 素材库', href: '/dashboard/materials', disabled: true },
      { icon: Factory, label: '内容生产', href: '/dashboard/production' },
      { icon: Radio, label: '分发管理', href: '/dashboard/distribution' },
    ],
  },
  {
    label: 'GEO 增强',
    items: [
      { icon: Search, label: '实体优化', href: '/dashboard/entity' },
      { icon: LinkIcon, label: '信源一致性', href: '/dashboard/consistency' },
      { icon: Target, label: '平台差异化', href: '/dashboard/platform', disabled: true },
      { icon: TrendingUp, label: '效果监控', href: '/dashboard/monitoring' },
      { icon: Waypoints, label: '直接路径', href: '/dashboard/direct-paths' },
    ],
  },
  {
    label: '系统',
    items: [
      { icon: Settings, label: '系统设置', href: '/dashboard/settings', disabled: true },
    ],
  },
];

export function Sidebar({ collapsed }: SidebarProps): React.ReactElement {
  const pathname = usePathname();

  const isActive = (href: string): boolean => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <aside className={cn('flex flex-col h-full bg-zinc-900 text-zinc-300 transition-all duration-200', collapsed ? 'w-16' : 'w-60')}>
      <div className={cn('flex items-center h-14 px-4 border-b border-zinc-800', collapsed ? 'justify-center' : 'gap-3')}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 flex-shrink-0">
          <Layers className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold text-white">GEO 平台</span>
            <span className="text-[10px] text-zinc-400">运营商工作台</span>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-6">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && <h3 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{group.label}</h3>}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href);
                if (item.disabled) {
                  return (
                    <li key={item.href}>
                      <span className={cn('flex items-center rounded-md px-3 py-2 text-sm cursor-not-allowed opacity-40', collapsed ? 'justify-center' : 'gap-3')} title={item.label}>
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {!collapsed && <><span className="flex-1 truncate">{item.label}</span><span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 flex-shrink-0">Q3 2026</span></>}
                      </span>
                    </li>
                  );
                }
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={cn('flex items-center rounded-md px-3 py-2 text-sm transition-colors', active ? 'bg-blue-600/20 text-white' : 'text-zinc-400 hover:bg-zinc-800 hover:text-white', collapsed ? 'justify-center' : 'gap-3')} title={item.label}>
                      <item.icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cn('px-4 py-3 border-t border-zinc-800', collapsed && 'px-2')}>
        <Separator className="mb-3 bg-zinc-800" />
        <p className={cn('text-[10px] text-zinc-600 text-center', collapsed && 'hidden')}>GEO Platform v1.0 · Production Ready</p>
      </div>
    </aside>
  );
}
