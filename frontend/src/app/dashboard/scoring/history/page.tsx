'use client';

/**
 * Scoring History Page — Trend line chart.
 *
 * SVG-based simple line chart (no external chart lib needed for MVP).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type ScoreRecord = {
  id: string; geoScore: number; d1Intent: number; d2Eeat: number;
  d3Reach: number; d4Compete: number; d5Impact: number;
  calculatedAt: string;
};

export default function ScoringHistoryPage(): React.ReactElement {
  const router = useRouter();
  const [history, setHistory] = useState<ScoreRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch(): Promise<void> {
      try {
        const data = await api.get<ScoreRecord[]>('/scoring/history', { limit: 12 });
        setHistory(data.reverse()); // chronological order
      } catch { /* empty */ }
      finally { setLoading(false); }
    }
    fetch();
  }, []);

  const chartW = 600, chartH = 220, padX = 40, padY = 20;
  const scores = history.map((h) => h.geoScore);
  const maxS = Math.max(100, ...scores);
  const minS = Math.min(0, ...scores);
  const range = maxS - minS || 1;

  const points = history.map((h, i) => {
    const x = padX + (i / Math.max(history.length - 1, 1)) * (chartW - padX * 2);
    const y = chartH - padY - ((h.geoScore - minS) / range) * (chartH - padY * 2);
    return `${x},${y}`;
  }).join(' ');

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/scoring')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">评分历史</h1>
          <p className="text-sm text-muted-foreground">GEO Score 随时间变化趋势</p>
        </div>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">GEO Score 趋势</CardTitle></CardHeader>
        <CardContent>
          {history.length < 2 ? (
            <div className="py-8 text-center text-muted-foreground">至少需要 2 次评分才能显示趋势</div>
          ) : (
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full">
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                const y = chartH - padY - pct * (chartH - padY * 2);
                return (
                  <g key={pct}>
                    <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#eee" strokeWidth={1} />
                    <text x={padX - 5} y={y + 4} textAnchor="end" className="text-[8px] fill-zinc-400">
                      {Math.round(minS + pct * range)}
                    </text>
                  </g>
                );
              })}
              {/* Line */}
              <polyline
                points={points}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dots */}
              {history.map((h, i) => {
                const x = padX + (i / Math.max(history.length - 1, 1)) * (chartW - padX * 2);
                const y = chartH - padY - ((h.geoScore - minS) / range) * (chartH - padY * 2);
                return (
                  <g key={h.id}>
                    <circle cx={x} cy={y} r={4} fill="#3b82f6" stroke="white" strokeWidth={2} />
                    <text x={x} y={y - 10} textAnchor="middle" className="text-[9px] fill-zinc-600">
                      {Math.round(h.geoScore)}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-zinc-500">
                <th className="text-left px-4 py-2">时间</th>
                <th className="text-right px-4 py-2">GEO</th>
                <th className="text-right px-4 py-2">D1</th>
                <th className="text-right px-4 py-2">D2</th>
                <th className="text-right px-4 py-2">D3</th>
                <th className="text-right px-4 py-2">D4</th>
                <th className="text-right px-4 py-2">D5</th>
              </tr>
            </thead>
            <tbody>
              {history.slice().reverse().map((h) => (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-xs">{new Date(h.calculatedAt).toLocaleString('zh-CN')}</td>
                  <td className="px-4 py-2 text-right font-mono font-medium">{Math.round(h.geoScore)}</td>
                  <td className="px-4 py-2 text-right">{h.d1Intent}</td>
                  <td className="px-4 py-2 text-right">{h.d2Eeat}</td>
                  <td className="px-4 py-2 text-right">{h.d3Reach}</td>
                  <td className="px-4 py-2 text-right">{h.d4Compete}</td>
                  <td className="px-4 py-2 text-right">{h.d5Impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
