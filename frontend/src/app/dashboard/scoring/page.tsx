'use client';

/**
 * GEO Scoring Overview Page.
 *
 * Shows: total GEO score circle, D1-D5 bar chart, E-E-A-T radar,
 * mind metrics, diagnostic panel.
 */

import { useEffect, useState } from 'react';
import { Calculator, RefreshCw, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScoreCircle } from '@/components/scoring/score-circle';
import { api } from '@/lib/api';

type ScoreData = {
  id: string;
  d1: number; d2: number; d3: number; d4: number; d5: number;
  geoScore: number; version: string;
  eeat: { experience: number; expertise: number; authoritativeness: number; trustworthiness: number } | null;
  mindMetrics: Array<{ platform: string; sentiment: number; depth: number; brandAssoc: number }>;
};

type DiagnosticData = {
  geoScore: number | null;
  summary: { passed: number; total: number; overall: string };
  checks: Array<{ id: string; name: string; passed: boolean; score: number; detail: string; suggestion: string }>;
};

const DIMS: Array<{ key: string; label: string; color: string }> = [
  { key: 'd1', label: 'D1 意图覆盖', color: 'bg-blue-500' },
  { key: 'd2', label: 'D2 E-E-A-T', color: 'bg-purple-500' },
  { key: 'd3', label: 'D3 分发渗透', color: 'bg-green-500' },
  { key: 'd4', label: 'D4 竞争抑制', color: 'bg-red-500' },
  { key: 'd5', label: 'D5 影响力', color: 'bg-amber-500' },
];

const PLATFORM_LABELS: Record<string, string> = { chatgpt: 'ChatGPT', google: 'Google', deepseek: 'DeepSeek', doubao: '豆包' };

export default function ScoringPage(): React.ReactElement {
  const [score, setScore] = useState<ScoreData | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  async function fetchData(): Promise<void> {
    try {
      const [s, d] = await Promise.all([
        api.get<ScoreData>('/scoring/latest'),
        api.get<DiagnosticData>('/scoring/diagnostic'),
      ]);
      setScore(s);
      setDiagnostic(d);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, []);

  async function handleCalculate(): Promise<void> {
    setCalculating(true);
    try {
      await api.post('/scoring/calculate');
      await fetchData();
    } finally {
      setCalculating(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  const dimValues = (score ? [score.d1, score.d2, score.d3, score.d4, score.d5] : [0, 0, 0, 0, 0]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">五维评分</h1>
          <p className="text-muted-foreground">GEO Score v5.0 · 级联公式：Production → Reach → Effective → GEO</p>
        </div>
        <Button onClick={handleCalculate} disabled={calculating}>
          <RefreshCw className={`h-4 w-4 mr-2 ${calculating ? 'animate-spin' : ''}`} />
          {calculating ? '计算中...' : '重新计算'}
        </Button>
      </div>

      {/* Score circle + D1-D5 bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score circle */}
        <Card className="flex flex-col items-center justify-center py-8">
          <ScoreCircle score={score?.geoScore ?? 0} size={180} label="GEO Score" />
          <p className="text-xs text-zinc-400 mt-2">版本 {score?.version ?? 'v5.0'}</p>
        </Card>

        {/* D1-D5 bars */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">五维分解</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {DIMS.map((dim, i) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{dim.label}</span>
                  <span className="font-mono font-medium">{dimValues[i]}</span>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2.5">
                  <div
                    className={`${dim.color} h-2.5 rounded-full transition-all duration-700`}
                    style={{ width: `${dimValues[i]}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* E-E-A-T + Mind Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* E-E-A-T */}
        {score?.eeat && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">E-E-A-T 四维评估</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { k: 'experience', label: '经验 Experience', v: score.eeat.experience },
                { k: 'expertise', label: '专业 Expertise', v: score.eeat.expertise },
                { k: 'authoritativeness', label: '权威 Authoritativeness', v: score.eeat.authoritativeness },
                { k: 'trustworthiness', label: '信任 Trustworthiness', v: score.eeat.trustworthiness },
              ].map((item) => (
                <div key={item.k} className="flex items-center gap-3">
                  <span className="text-sm w-40 text-zinc-600">{item.label}</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-2">
                    <div className="bg-violet-500 h-2 rounded-full" style={{ width: `${item.v}%` }} />
                  </div>
                  <span className="text-sm font-mono w-8 text-right">{item.v}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Mind Metrics */}
        {score?.mindMetrics && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">心智指标</CardTitle>
              <CardDescription>各 AI 平台品牌心智占有度</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {score.mindMetrics.map((m) => (
                  <div key={m.platform} className="rounded-md border p-3 text-center space-y-1">
                    <span className="text-sm font-medium">{PLATFORM_LABELS[m.platform] ?? m.platform}</span>
                    <div className="flex justify-center gap-2 text-xs">
                      <span className="text-zinc-400">情感 {m.sentiment}</span>
                      <span className="text-zinc-400">认知 {m.depth}</span>
                      <span className="text-zinc-400">品牌 {m.brandAssoc}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Diagnostic */}
      {diagnostic && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="h-4 w-4" />"为什么 AI 不引用你"诊断
                </CardTitle>
                <CardDescription>
                  {diagnostic.summary.passed}/{diagnostic.summary.total} 项通过 ·{' '}
                  {diagnostic.summary.overall === 'good' ? '🟢 良好' : diagnostic.summary.overall === 'fair' ? '🟡 中等' : '🔴 需改进'}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.location.href = '/dashboard/scoring/history'}>
                <TrendingUp className="h-3 w-3 mr-1" />历史趋势
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {diagnostic.checks.map((check) => (
                <div key={check.id} className={`rounded-md border p-3 ${check.passed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">
                      {check.passed ? '✅' : '❌'} {check.name}
                    </span>
                    <span className="text-xs font-mono bg-white px-1.5 py-0.5 rounded">{check.score}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{check.detail}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 italic">{check.suggestion}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score Change Timeline (Phase 3) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">评分变更历史</CardTitle>
        </CardHeader>
        <CardContent>
          <ScoreChanges />
        </CardContent>
      </Card>
    </div>
  );
}

function ScoreChanges(): React.ReactElement {
  const [changes, setChanges] = useState<Array<{ id: string; previousScore: number | null; newScore: number; reason: string; createdAt: string }>>([]);

  useEffect(() => {
    api.get<Array<{ id: string; previousScore: number | null; newScore: number; reason: string; createdAt: string }>>('/scoring/changes')
      .then(setChanges).catch(() => {});
  }, []);

  if (changes.length === 0) return <p className="text-sm text-zinc-400 py-4 text-center">暂无评分变更</p>;

  return (
    <div className="space-y-2">
      {changes.map((c) => (
        <div key={c.id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
          <span className="text-zinc-500 text-xs">{new Date(c.createdAt).toLocaleString('zh-CN')}</span>
          <span className="flex items-center gap-1">
            {c.previousScore !== null && <span className="text-zinc-400">{Math.round(c.previousScore)}</span>}
            {c.previousScore !== null && <span className="text-zinc-300">→</span>}
            <span className={`font-mono font-medium ${c.previousScore !== null && c.newScore > c.previousScore ? 'text-green-600' : c.previousScore !== null ? 'text-red-500' : 'text-blue-600'}`}>
              {Math.round(c.newScore)}
            </span>
          </span>
          <span className="text-xs text-zinc-400 truncate max-w-60">{c.reason}</span>
        </div>
      ))}
    </div>
  );
}
