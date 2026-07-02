'use client';

/**
 * Source Consistency Page.
 *
 * 5 source profile cards + field-level comparison table.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, Globe, Building, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type ProfileStat = { source: string; status: string; lastScanned: string | null; critical: number; consistent: number; total: number };
type Summary = { profiles: ProfileStat[]; totalCritical: number; totalConsistent: number };
type Conflict = { id: string; fieldName: string; ourValue: string | null; theirValue: string | null; normalized: boolean; conflict: string; profile: { source: string }; actions: Array<{ id: string; status: string }> };

const SOURCE_LABELS: Record<string, string> = {
  baidu_baike: '百度百科', qichacha: '企查查', alibaba_1688: '阿里巴巴1688',
  industry_yellowpage: '行业黄页', gov_registry: '政府注册信息',
};
const CONFLICT_STYLE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700', consistent: 'bg-green-100 text-green-700',
  info: 'bg-blue-100 text-blue-700', missing: 'bg-yellow-100 text-yellow-700',
};

export default function ConsistencyPage(): React.ReactElement {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  async function fetch(): Promise<void> {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        api.get<Summary>('/consistency/summary'),
        api.get<Conflict[]>('/consistency/conflicts'),
      ]);
      setSummary(s); setConflicts(c);
    } finally { setLoading(false); }
  }

  useEffect(() => { fetch(); }, []);

  async function handleScan(): Promise<void> {
    setScanning(true);
    try { await api.post('/consistency/scan'); await fetch(); } finally { setScanning(false); }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">信源一致性</h1>
          <p className="text-muted-foreground">5 信源 × 10 字段对比检测（百度百科/1688 自动，其余手动录入）</p>
        </div>
        <Button onClick={handleScan} disabled={scanning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? '扫描中...' : '全部扫描'}
        </Button>
      </div>

      {/* Source Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {(summary?.profiles ?? []).map((p) => (
          <Card key={p.source} className={p.status === 'failed' ? 'border-red-200' : ''}>
            <CardContent className="pt-4 text-center space-y-2">
              <Globe className="h-5 w-5 mx-auto text-zinc-400" />
              <div className="text-sm font-medium">{SOURCE_LABELS[p.source] ?? p.source}</div>
              <div className="flex justify-center gap-2 text-xs">
                {p.critical > 0 && <span className="text-red-600 font-medium">{p.critical} ⚠</span>}
                {p.consistent > 0 && <span className="text-green-600">{p.consistent} ✓</span>}
                {p.total === 0 && <span className="text-zinc-400">—</span>}
              </div>
              <div className="text-[10px] text-zinc-400">
                {p.lastScanned ? new Date(p.lastScanned).toLocaleString('zh-CN') : '未扫描'}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Conflict Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            字段对比表
            {summary && (summary.totalCritical > 0) && (
              <span className="ml-2 text-sm font-normal text-red-600">{summary.totalCritical} 个冲突</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-zinc-500">
                <th className="text-left px-4 py-2">信源</th>
                <th className="text-left px-4 py-2">字段</th>
                <th className="text-left px-4 py-2">知识库基准值</th>
                <th className="text-left px-4 py-2">信源平台值</th>
                <th className="text-center px-4 py-2 w-20">状态</th>
              </tr>
            </thead>
            <tbody>
              {conflicts.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs">{SOURCE_LABELS[c.profile.source] ?? c.profile.source}</td>
                  <td className="px-4 py-2 font-medium">{c.fieldName}</td>
                  <td className="px-4 py-2 text-xs">{c.ourValue ?? '—'}</td>
                  <td className="px-4 py-2 text-xs">{c.theirValue ?? '—'}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${CONFLICT_STYLE[c.conflict ?? 'info']}`}>
                      {c.conflict === 'critical' ? '冲突' : c.conflict === 'consistent' ? '一致' : c.conflict === 'missing' ? '缺失' : '信息'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {conflicts.length === 0 && <div className="py-8 text-center text-muted-foreground text-sm">暂无对比数据，点击"全部扫描"开始</div>}
        </CardContent>
      </Card>
    </div>
  );
}
