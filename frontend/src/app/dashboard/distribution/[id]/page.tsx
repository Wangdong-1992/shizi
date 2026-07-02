'use client';

/**
 * Distribution Detail Page — per-article distribution status.
 *
 * Shows: status timeline, per-channel logs, half-auto copy helper.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Clock, XCircle, AlertTriangle, Copy, ExternalLink, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type DistributionRecord = {
  id: string; article_id: string; channel: { id: string; name: string; type: string; front_mode: string };
  status: string; attempts: number; error: string | null;
  logs: Array<{ level: string; message: string; created_at: string }>;
};

type ContentDraft = {
  id: string; title: string; content: string; format: string; words: number | null;
};

const STATUS_STYLES: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  queued:  { icon: Clock, color: 'text-blue-500', label: '排队中' },
  sending: { icon: Clock, color: 'text-amber-500', label: '发送中' },
  synced:  { icon: CheckCircle, color: 'text-green-500', label: '已同步' },
  failed:  { icon: XCircle, color: 'text-red-500', label: '失败' },
  error:   { icon: AlertTriangle, color: 'text-red-500', label: '错误' },
};

export default function DistributionDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [draft, setDraft] = useState<ContentDraft | null>(null);
  const [distributions, setDistributions] = useState<DistributionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetch(): Promise<void> {
      try {
        const data = await api.get<ContentDraft>(`/content/${id}`);
        setDraft(data);
      } catch {
        router.push('/dashboard/distribution');
        return;
      }

      // Fetch distribution status for each channel (Phase 3: aggregated endpoint)
      // For MVP, show a message about checking individual distribution status
      try {
        // Note: GEOFlow distribution status is per-distribution-id.
        // The draft ID corresponds to the content ID used when enqueuing.
        const status = await api.get<DistributionRecord>(`/distribution/status/${id}`);
        setDistributions([status]);
      } catch { /* may not have distributions yet */ }
      finally { setLoading(false); }
    }
    fetch();
  }, [id, router]);

  function copyContent(): void {
    if (!draft?.content) return;
    navigator.clipboard.writeText(draft.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
  if (!draft) return <div className="p-8 text-center text-muted-foreground">内容不存在</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/distribution')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">分发详情</h1>
          <p className="text-sm text-muted-foreground">{draft.title}</p>
        </div>
      </div>

      {/* Content preview with copy */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">内容预览</CardTitle>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={copyContent}>
              <Copy className="h-3 w-3 mr-1" />{copied ? '已复制' : '一键复制'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed max-h-64 overflow-y-auto">
            {draft.content || '(内容为空)'}
          </div>
        </CardContent>
      </Card>

      {/* Distribution status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">分发状态</CardTitle>
        </CardHeader>
        <CardContent>
          {distributions.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">
              暂无分发记录。请先在分发管理页面入队。
            </div>
          ) : (
            <div className="space-y-4">
              {distributions.map((dist) => {
                const st = STATUS_STYLES[dist.status] ?? STATUS_STYLES.queued;
                const Icon = st.icon;
                return (
                  <div key={dist.id} className="rounded-md border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${st.color}`} />
                        <span className="font-medium text-sm">{dist.channel.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.color} bg-opacity-10`}>
                          {st.label}
                        </span>
                        {dist.attempts > 0 && (
                          <span className="text-xs text-zinc-400">重试 {dist.attempts} 次</span>
                        )}
                      </div>
                    </div>

                    {dist.error && (
                      <div className="rounded bg-red-50 px-3 py-2 text-xs text-red-700 mb-2">
                        {dist.error}
                      </div>
                    )}

                    {/* Log timeline */}
                    {dist.logs.length > 0 && (
                      <div className="space-y-1.5">
                        {dist.logs.map((log, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`mt-0.5 inline-block w-1.5 h-1.5 rounded-full ${
                              log.level === 'error' ? 'bg-red-400' : log.level === 'warning' ? 'bg-amber-400' : 'bg-green-400'
                            }`} />
                            <span className="flex-1">{log.message}</span>
                            <span className="text-zinc-400 flex-shrink-0">
                              {new Date(log.created_at).toLocaleTimeString('zh-CN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Half-auto helper */}
                    {(dist.channel.type === 'generic_http_api') && (
                      <div className="mt-3 pt-3 border-t text-xs space-y-2">
                        <p className="text-amber-600 font-medium">半自动渠道 — 请手动发布</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7" onClick={copyContent}>
                            <Copy className="h-3 w-3 mr-1" />复制格式化内容
                          </Button>
                          <Button size="sm" variant="outline" className="h-7">
                            <ExternalLink className="h-3 w-3 mr-1" />打开发布页面
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
