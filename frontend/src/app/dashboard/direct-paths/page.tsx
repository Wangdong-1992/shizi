'use client';

/**
 * Direct Path Management Page.
 *
 * 6 status-tracked channels: llms.txt, 百度百科, 百度智能体, 搜狗百科, Wikidata, 企查查.
 * BullMQ checks daily at 6:00 AM.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, FileText, BookOpen, Bot, Globe, Building, CheckCircle, Clock, AlertTriangle, XCircle, MinusCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type PathItem = {
  id: string; pathType: string; label: string; url: string | null;
  status: string; lastChecked: string | null; errorMessage: string | null;
};

const PATH_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  llms_txt: FileText, baidu_baike: BookOpen, baidu_agent: Bot,
  sogou_baike: BookOpen, wikidata: Globe, qichacha: Building,
};

const STATUS_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  active:  { icon: CheckCircle, color: 'bg-green-100 text-green-700 border-green-200', label: '已激活' },
  pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: '待检测' },
  error:   { icon: XCircle, color: 'bg-red-100 text-red-700 border-red-200', label: '异常' },
  not_applicable: { icon: MinusCircle, color: 'bg-zinc-100 text-zinc-500 border-zinc-200', label: '不适用' },
};

export default function DirectPathsPage(): React.ReactElement {
  const [paths, setPaths] = useState<PathItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);

  async function fetch(): Promise<void> {
    setLoading(true);
    try { setPaths(await api.get<PathItem[]>('/direct-paths')); }
    catch { setPaths([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetch(); }, []);

  async function handleCheck(id: string): Promise<void> {
    setChecking(id);
    try { await api.post(`/direct-paths/${id}/check`); await fetch(); }
    finally { setChecking(null); }
  }

  async function handleCheckAll(): Promise<void> {
    setChecking('all');
    try { await api.post('/direct-paths/check-all'); await fetch(); }
    finally { setChecking(null); }
  }

  async function handleSaveUrl(id: string, url: string): Promise<void> {
    try { await api.put(`/direct-paths/${id}`, { url }); await fetch(); }
    catch { /* ignore */ }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">直接路径</h1>
          <p className="text-muted-foreground">6 条 SEO/信息发现通道状态追踪（BullMQ 每日 6:00 AM 自动检测）</p>
        </div>
        <Button onClick={handleCheckAll} disabled={checking === 'all'}>
          <RefreshCw className={`h-4 w-4 mr-2 ${checking === 'all' ? 'animate-spin' : ''}`} />
          {checking === 'all' ? '检测中...' : '全部检测'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paths.map((p) => {
          const st = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
          const Icon = PATH_ICONS[p.pathType] ?? BookOpen;
          const StIcon = st.icon;

          return (
            <Card key={p.id} className={p.status !== 'active' ? 'opacity-90' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-zinc-500" />
                    <CardTitle className="text-sm">{p.label}</CardTitle>
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${st.color}`}>
                    <StIcon className="h-3 w-3 inline mr-0.5" />{st.label}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Editable URL */}
                <div className="flex gap-1">
                  <Input
                    className="h-7 text-xs"
                    placeholder={p.pathType === 'llms_txt' ? 'https://example.com/llms.txt' : `检测 URL (${p.label})`}
                    value={p.url ?? ''}
                    onChange={(e) => {
                      setPaths((prev) => prev.map((x) => x.id === p.id ? { ...x, url: e.target.value } : x));
                    }}
                    onBlur={() => { if (p.url !== null) handleSaveUrl(p.id, p.url ?? ''); }}
                  />
                </div>

                {/* Error message */}
                {p.errorMessage && (
                  <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">{p.errorMessage}</p>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>
                    {p.lastChecked
                      ? `上次检测: ${new Date(p.lastChecked).toLocaleString('zh-CN')}`
                      : '尚未检测'}
                  </span>
                  <Button
                    variant="ghost" size="sm" className="h-6 text-xs"
                    disabled={checking === p.id}
                    onClick={() => handleCheck(p.id)}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${checking === p.id ? 'animate-spin' : ''}`} />
                    检测
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
