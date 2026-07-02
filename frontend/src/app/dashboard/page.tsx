'use client';

/**
 * Dashboard — Phase 4 Final: 10 real-time metric cards (2 rows × 5 cols).
 */

import { useEffect, useState } from 'react';
import { Building2, FileText, Clock, TrendingUp, Bot, MessageSquare, BookOpen, LinkIcon, Waypoints, Radio } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { PaginatedData, Client } from '@/lib/types';

interface MetricCard { title: string; value: string | number; description: string; icon: React.ComponentType<{ className?: string }>; }

export default function DashboardPage(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Record<string, string | number | null>>({});
  const [knowledgeTotal, setKnowledgeTotal] = useState<number | null>(null);

  useEffect(() => {
    async function fetch(): Promise<void> {
      try {
        const [clients, approved, review, scoring, crawlers, mentions, consistency, dp, kb, dist] = await Promise.all([
          api.get<PaginatedData<Client>>('/clients', { pageSize: 1 }),
          api.get<PaginatedData<unknown>>('/content', { pageSize: 1, status: 'approved' }),
          api.get<PaginatedData<unknown>>('/content', { pageSize: 1, status: 'review' }),
          api.get<{ geoScore: number } | null>('/scoring/latest'),
          api.get<{ total: number }>('/monitoring/crawlers', { days: 7 }),
          api.get<{ mentionRate: number }>('/monitoring/mentions'),
          api.get<{ totalCritical: number }>('/consistency/summary'),
          api.get<Array<{ status: string }>>('/direct-paths'),
          api.get<PaginatedData<unknown>>('/knowledge', { pageSize: 1 }),
          api.get<{ channels: Array<{ name: string }> }>('/distribution/channels'),
        ]);
        setData({
          clients: clients.total,
          approved: approved.total,
          review: review.total,
          geoScore: scoring?.geoScore ?? null,
          crawlers: crawlers?.total ?? null,
          mentionRate: mentions?.mentionRate ?? null,
          conflicts: consistency?.totalCritical ?? null,
          activePaths: dp?.filter((p: any) => p.status === 'active').length ?? null,
          channels: dist?.channels?.length ?? null,
        });
        setKnowledgeTotal(kb.total);
      } catch {} finally { setLoading(false); }
    }
    fetch();
  }, []);

  const v = (key: string, fmt?: (v: any) => string) => loading ? '...' : (data[key] != null ? (fmt ? fmt(data[key]) : String(data[key])) : '—');

  const cards: MetricCard[] = [
    { title: '客户总数', value: v('clients'), description: '已注册客户', icon: Building2 },
    { title: '知识条目', value: loading ? '...' : (knowledgeTotal ?? '—'), description: '已发布知识', icon: BookOpen },
    { title: '已发布内容', value: v('approved'), description: '已完成审核', icon: FileText },
    { title: '待审核', value: v('review'), description: '等待人审', icon: Clock },
    { title: 'GEO 评分', value: v('geoScore', (x) => Math.round(x)), description: 'v5.0', icon: TrendingUp },
    { title: 'AI 爬虫', value: v('crawlers'), description: '7 天访问', icon: Bot },
    { title: '品牌引用率', value: v('mentionRate', (x) => `${(x * 100).toFixed(0)}%`), description: '20 题×4 平台', icon: MessageSquare },
    { title: '信源冲突', value: v('conflicts'), description: '待处理', icon: LinkIcon },
    { title: '活跃路径', value: v('activePaths'), description: '直接路径', icon: Waypoints },
    { title: '分发渠道', value: v('channels'), description: 'Tier 0-3', icon: Radio },
  ];

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">运营仪表盘</h1><p className="text-muted-foreground">GEO Platform v1.0 · Production Ready</p></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{card.title}</CardTitle>
              <card.icon className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">{card.value}</div>
              <p className="text-[10px] text-muted-foreground mt-0.5">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
