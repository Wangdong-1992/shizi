'use client';

/**
 * Content Production Page.
 *
 * Features:
 *   - Draft list (left panel) with status tags
 *   - Create new content (Q&A title input)
 *   - Click draft → navigate to detail/edit page
 *   - Status polling for generating drafts
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, FileText, CheckCircle, XCircle, Clock, PenLine, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';

type DraftItem = {
  id: string;
  title: string;
  status: string;
  words: number | null;
  aiRatio: number | null;
  geoScore: number | null;
  createdAt: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft:      { label: '草稿',     color: 'bg-zinc-100 text-zinc-600',   icon: FileText },
  generating: { label: '生成中',   color: 'bg-blue-100 text-blue-600',    icon: Loader2 },
  review:     { label: '待审核',   color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  approved:   { label: '已通过',   color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  rejected:   { label: '已拒绝',   color: 'bg-red-100 text-red-600',      icon: XCircle },
};

export default function ProductionPage(): React.ReactElement {
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchDrafts = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { page: 1, pageSize: 50 };
      if (filterStatus) params.status = filterStatus;
      const data = await api.get<{ items: DraftItem[] }>('/content', params);
      setDrafts(data.items);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  // Poll for generating drafts
  useEffect(() => {
    if (!drafts.some((d) => d.status === 'generating')) return;
    const timer = setInterval(fetchDrafts, 5000);
    return () => clearInterval(timer);
  }, [drafts, fetchDrafts]);

  async function handleCreate(): Promise<void> {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await api.post('/content/generate', { title: newTitle.trim() });
      setNewTitle('');
      await fetchDrafts();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">内容生产</h1>
          <p className="text-muted-foreground">AI 驱动 Q&A 内容生成 + 机器人审流程</p>
        </div>
      </div>

      {/* Create bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input
              placeholder="输入 Q&A 格式标题（15-30 字长问句），如：水果罐头开封后能放多久？"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              {creating ? '创建中...' : 'AI 生成'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {[{ k: null, v: '全部' }, { k: 'generating', v: '生成中' }, { k: 'review', v: '待审核' },
          { k: 'approved', v: '已通过' }, { k: 'rejected', v: '已拒绝' }, { k: 'draft', v: '草稿' },
        ].map((f) => (
          <Button
            key={f.k ?? 'all'}
            variant={filterStatus === f.k ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilterStatus(f.k)}
          >
            {f.v}
          </Button>
        ))}
      </div>

      {/* Draft list */}
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : drafts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无内容草稿，输入标题后点击"AI 生成"开始
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft) => {
            const cfg = STATUS_CONFIG[draft.status] ?? STATUS_CONFIG.draft;
            const Icon = cfg.icon;

            return (
              <Card
                key={draft.id}
                className="cursor-pointer hover:bg-zinc-50 transition-colors"
                onClick={() => router.push(`/dashboard/production/${draft.id}`)}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`h-4 w-4 flex-shrink-0 ${draft.status === 'generating' ? 'animate-spin' : ''}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{draft.title}</p>
                      <p className="text-xs text-zinc-400">
                        {new Date(draft.createdAt).toLocaleDateString('zh-CN')}
                        {draft.words ? ` · ${draft.words} 字` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(draft.aiRatio !== null) && (
                      <span className="text-[11px] text-zinc-400 font-mono">AI {draft.aiRatio}%</span>
                    )}
                    {(draft.geoScore !== null) && (
                      <span className="text-[11px] font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                        GEO {draft.geoScore}
                      </span>
                    )}
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
