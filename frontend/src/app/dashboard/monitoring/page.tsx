'use client';

/**
 * Monitoring Dashboard — Crawler Detection + Brand Mentions.
 */

import { useEffect, useState } from 'react';
import { Bot, BarChart3, MessageSquare, Eye, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreCircle } from '@/components/scoring/score-circle';
import { api } from '@/lib/api';

type CrawlerStats = { days: number; stats: Record<string, { total: number; daily: Record<string, number> }>; total: number };
type CrawlerLog = { id: string; crawler: string; path: string; statusCode: number | null; visitedAt: string };
type MentionStats = { totalQueries: number; totalMentions: number; mentionRate: number; byPlatform: Record<string, { total: number; mentioned: number; rate: number }>; bySentiment: Record<string, number>; byDepth: Record<string, number> };
type MentionRecord = { id: string; platform: string; query: string; mentioned: boolean; sentiment: string | null; checkedAt: string };

const CRAWLER_COLORS: Record<string, string> = {
  gptbot: '#10b981', googlebot: '#3b82f6', claudebot: '#8b5cf6',
  bytespider: '#f59e0b', bingbot: '#ef4444', commoncrawl: '#6b7280', other: '#9ca3af',
};
const CRAWLER_LABELS: Record<string, string> = {
  gptbot: 'GPTBot', googlebot: 'Googlebot', claudebot: 'ClaudeBot',
  bytespider: '字节', bingbot: 'Bingbot', commoncrawl: 'CCBot', other: '其他',
};
const PLATFORM_LABELS: Record<string, string> = { chatgpt: 'ChatGPT', google: 'Google AI', deepseek: 'DeepSeek', doubao: '豆包' };

export default function MonitoringPage(): React.ReactElement {
  const [crawlerStats, setCrawlerStats] = useState<CrawlerStats | null>(null);
  const [crawlerLogs, setCrawlerLogs] = useState<CrawlerLog[]>([]);
  const [mentionStats, setMentionStats] = useState<MentionStats | null>(null);
  const [mentions, setMentions] = useState<MentionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetch(): Promise<void> {
    try {
      const [cs, cl, ms, mr] = await Promise.all([
        api.get<CrawlerStats>('/monitoring/crawlers', { days: 7 }),
        api.get<CrawlerLog[]>('/monitoring/crawlers/recent'),
        api.get<MentionStats>('/monitoring/mentions'),
        api.get<MentionRecord[]>('/monitoring/mentions/recent'),
      ]);
      setCrawlerStats(cs); setCrawlerLogs(cl); setMentionStats(ms); setMentions(mr);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }

  async function handleCollect(): Promise<void> {
    try { await api.post('/monitoring/mentions/collect'); await fetch(); } catch { /* */ }
  }

  useEffect(() => { fetch(); }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  const chartH = 180; const chartW = 500;
  const maxVisits = crawlerStats ? Math.max(1, ...Object.values(crawlerStats.stats).map((s) => s.total)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">效果监控</h1>
          <p className="text-muted-foreground">AI 爬虫访问分析 + 品牌提及检测</p>
        </div>
        <Button onClick={handleCollect} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />采集品牌提及
        </Button>
      </div>

      {/* Crawler stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4" />AI 爬虫访问（7 天）
            <span className="text-[10px] font-normal text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">→ 影响 D3 评分</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Summary cards */}
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-4">
            {Object.entries(crawlerStats?.stats ?? {}).map(([crawler, s]) => (
              <div key={crawler} className="rounded border p-2 text-center">
                <div className="text-lg font-bold" style={{ color: CRAWLER_COLORS[crawler] }}>{s.total}</div>
                <div className="text-[10px] text-zinc-400">{CRAWLER_LABELS[crawler] ?? crawler}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
            {Object.entries(crawlerStats?.stats ?? {}).map(([crawler, s], i) => {
              const bw = chartW / 7 - 8; const x = 4 + i * (chartW / 7); const h = (s.total / maxVisits) * (chartH - 20);
              return <rect key={crawler} x={x} y={chartH - h} width={bw} height={h} rx={2} fill={CRAWLER_COLORS[crawler] ?? '#ccc'} />;
            })}
          </svg>
        </CardContent>
      </Card>

      {/* Brand mention stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />品牌引用率
              <span className="text-[10px] font-normal text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">→ 影响 D5 评分</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center">
              <ScoreCircle score={mentionStats ? Math.round(mentionStats.mentionRate * 100) : 0} size={140} label="引用率" />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {Object.entries(mentionStats?.byPlatform ?? {}).map(([p, s]) => (
                <div key={p} className="rounded border p-2 text-center">
                  <div className="text-sm font-medium">{PLATFORM_LABELS[p] ?? p}</div>
                  <div className="text-xs text-zinc-400">{s.mentioned}/{s.total} ({(s.rate * 100).toFixed(0)}%)</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">情感分布</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(mentionStats?.bySentiment ?? {}).map(([sent, count]) => (
                <div key={sent} className="flex items-center gap-2">
                  <span className="text-sm w-12 text-right">{sent === 'positive' ? '😊' : sent === 'neutral' ? '😐' : '😟'} {sent}</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${sent === 'positive' ? 'bg-green-400' : sent === 'neutral' ? 'bg-amber-400' : 'bg-red-400'}`}
                      style={{ width: `${((count / Math.max(1, (mentionStats?.totalMentions ?? 1))) * 100)}%` }} />
                  </div>
                  <span className="text-xs w-8">{count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />最近爬虫访问</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
              {crawlerLogs.slice(0, 20).map((log) => (
                <div key={log.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <span className="font-medium" style={{ color: CRAWLER_COLORS[log.crawler] ?? '#666' }}>
                    {CRAWLER_LABELS[log.crawler] ?? log.crawler}
                  </span>
                  <span className="truncate max-w-40 text-zinc-400">{log.path}</span>
                  <span className="flex-shrink-0">{new Date(log.visitedAt).toLocaleDateString('zh-CN')}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">最近品牌提及</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs max-h-64 overflow-y-auto">
              {mentions.slice(0, 10).map((m) => (
                <div key={m.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <span className={m.mentioned ? 'text-green-600' : 'text-zinc-400'}>
                    {m.mentioned ? '✓' : '✗'}
                  </span>
                  <span className="truncate max-w-40">{m.query}</span>
                  <span className="text-zinc-400">{PLATFORM_LABELS[m.platform] ?? m.platform}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
