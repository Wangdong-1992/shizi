'use client';

/**
 * Distribution Management Page.
 *
 * Shows: channel list (Tier 0-3), approved content list,
 * enqueue buttons, status tracking.
 */

import { useEffect, useState, useCallback } from 'react';
import { Radio, Send, Download, CheckCircle, Clock, AlertTriangle, XCircle, ExternalLink } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/types';

type Channel = {
  id: string; name: string; domain: string | null; channel_type: string;
  tier: number; tier_label: string; mode: 'auto' | 'half-auto'; mode_label: string;
  status: string; site_name: string; health: string;
};

type TierGroup = { tier: number; label: string; items: Channel[] };

type ApprovedDraft = { id: string; title: string; words: number | null; geoScore: number | null };

type EnqueueResult = {
  article_id: string;
  results: Array<{ channel_id: string; channel_name: string; distribution_id: string | null; status: string; error?: string }>;
};

const TIER_COLORS: Record<number, string> = {
  0: 'bg-green-100 text-green-700',
  1: 'bg-blue-100 text-blue-700',
  2: 'bg-yellow-100 text-yellow-700',
  3: 'bg-zinc-100 text-zinc-600',
};

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  synced: CheckCircle, sending: Clock, queued: Clock, failed: XCircle, error: AlertTriangle,
};

export default function DistributionPage(): React.ReactElement {
  const [grouped, setGrouped] = useState<TierGroup[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [drafts, setDrafts] = useState<ApprovedDraft[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<string | null>(null);
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [enqueueResults, setEnqueueResults] = useState<EnqueueResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [enqueuing, setEnqueuing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [chRes, draftRes] = await Promise.all([
        api.get<{ channels: Channel[]; grouped: TierGroup[] }>('/distribution/channels'),
        api.get<PaginatedData<ApprovedDraft>>('/content', { status: 'approved', pageSize: 50 }),
      ]);
      setChannels(chRes.channels);
      setGrouped(chRes.grouped);
      setDrafts(draftRes.items);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function toggleChannel(id: string): void {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleEnqueue(): Promise<void> {
    if (!selectedDraft || selectedChannels.size === 0) return;
    setEnqueuing(true);
    setEnqueueResults(null);
    try {
      const result = await api.post<EnqueueResult>('/distribution/enqueue', {
        draftId: selectedDraft,
        channelIds: [...selectedChannels],
      });
      setEnqueueResults(result);
      setSelectedChannels(new Set());
    } finally {
      setEnqueuing(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">分发管理</h1>
        <p className="text-muted-foreground">管理内容到各渠道的自动/半自动分发</p>
      </div>

      {/* Enqueue section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">选择内容 + 渠道 → 入队分发</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Draft selector */}
          <div>
            <label className="text-sm font-medium mb-2 block">选择已审核内容</label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedDraft ?? ''}
              onChange={(e) => { setSelectedDraft(e.target.value || null); setEnqueueResults(null); }}
            >
              <option value="">— 选择内容 —</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>{d.title} {d.geoScore ? `(GEO ${d.geoScore})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Channel selector */}
          {selectedDraft && (
            <div>
              <label className="text-sm font-medium mb-2 block">选择分发渠道</label>
              <div className="flex flex-wrap gap-2">
                {channels.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => toggleChannel(ch.id)}
                    className={`rounded-md border px-3 py-1.5 text-xs transition-colors ${
                      selectedChannels.has(ch.id)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <span className={`mr-1.5 px-1 py-0.5 rounded ${TIER_COLORS[ch.tier] ?? ''}`}>{ch.tier_label}</span>
                    {ch.name}
                    <span className="ml-1 text-zinc-400">({ch.mode_label})</span>
                  </button>
                ))}
              </div>
              <Button
                className="mt-3"
                disabled={selectedChannels.size === 0 || enqueuing}
                onClick={handleEnqueue}
              >
                <Send className="h-4 w-4 mr-2" />
                {enqueuing ? '入队中...' : `入队分发 (${selectedChannels.size} 个渠道)`}
              </Button>
            </div>
          )}

          {/* Results */}
          {enqueueResults && (
            <div className="rounded-md border p-3 space-y-1">
              <p className="text-sm font-medium">分发入队结果</p>
              {enqueueResults.results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {r.status === 'queued' ? (
                    <CheckCircle className="h-3 w-3 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                  <span>{r.channel_name}</span>
                  <span className="text-zinc-400">{r.status}{r.error ? `: ${r.error}` : ''}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Channel list by tier */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">渠道列表 (Tier 0-3)</h2>
        {grouped.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">暂无可用分发渠道</CardContent></Card>
        ) : (
          grouped.map((group) => (
            <div key={group.tier}>
              <h3 className="text-sm font-medium text-zinc-500 mb-2">Tier {group.tier}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.items.map((ch) => (
                  <Card key={ch.id} className={ch.status !== 'active' ? 'opacity-60' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">{ch.name}</CardTitle>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TIER_COLORS[ch.tier] ?? ''}`}>
                          {ch.tier_label}
                        </span>
                      </div>
                      <CardDescription className="text-xs">
                        {ch.site_name}
                        {ch.domain && <span className="ml-1 text-zinc-400">({ch.domain})</span>}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className={
                            ch.mode === 'auto' ? 'text-green-600' : 'text-yellow-600'
                          }>
                            {ch.mode_label}
                          </span>
                          <span className="text-zinc-400">{ch.channel_type}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                            ch.health === 'healthy' ? 'bg-green-400' : 'bg-zinc-300'
                          }`} />
                          {ch.channel_type === 'geoflow_agent' && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="下载 Agent 站点包">
                              <Download className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
