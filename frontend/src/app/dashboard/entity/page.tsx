'use client';

import { useEffect, useState } from 'react';
import { BarChart3, Globe, Code, TrendingUp, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScoreCircle } from '@/components/scoring/score-circle';
import { api } from '@/lib/api';

type DimData = { label: string; value: number; color: string };

export default function EntityPage(): React.ReactElement {
  const [profile, setProfile] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const [schemaHealth, setSchemaHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showSchema, setShowSchema] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/entity/brand-profile'), api.get('/entity/org-schema'), api.post('/entity/org-schema/validate'),
    ]).then(([p, s, h]: any[]) => { setProfile(p); setSchema(s); setSchemaHealth(h); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  const dims: DimData[] = profile ? [
    { label: '内容', value: Math.min(100, profile.content.categoriesCovered * 10), color: '#3b82f6' },
    { label: '可见度', value: Math.round(profile.visibility.mentionRate * 100), color: '#10b981' },
    { label: '权威度', value: profile.authority.consistencyScore, color: '#8b5cf6' },
    { label: '关联度', value: Math.min(100, profile.associations.length * 5), color: '#f59e0b' },
  ] : [];

  const radarR = 80; const cx = 120; const cy = 100;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold tracking-tight">实体优化</h1><p className="text-muted-foreground">品牌实体画像 + Organization Schema + 关联概念</p></div>

      {/* Radar + Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />品牌四维度</CardTitle></CardHeader>
          <CardContent>
            <svg viewBox="0 0 240 200" className="w-full max-w-xs mx-auto">
              {[40, 80].map((l) => {
                const pts = dims.map((_, i) => {
                  const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                  return `${cx + Math.cos(a) * l * radarR / 100},${cy + Math.sin(a) * l * radarR / 100}`;
                }).join(' ');
                return <polygon key={l} points={pts} fill="none" stroke="#e5e7eb" strokeWidth={1} />;
              })}
              <polygon
                points={dims.map((d, i) => {
                  const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                  return `${cx + Math.cos(a) * d.value * radarR / 100},${cy + Math.sin(a) * d.value * radarR / 100}`;
                }).join(' ')}
                fill="rgba(59,130,246,0.15)" stroke="#3b82f6" strokeWidth={2}
              />
              {dims.map((d, i) => {
                const a = (Math.PI * 2 * i) / dims.length - Math.PI / 2;
                const tx = cx + Math.cos(a) * (radarR + 20); const ty = cy + Math.sin(a) * (radarR + 20);
                return <text key={d.label} x={tx} y={ty} textAnchor="middle" className="text-[10px] fill-zinc-500">{d.label}<tspan x={tx} dy={12} className="fill-zinc-700 font-bold">{d.value}</tspan></text>;
              })}
            </svg>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4" />Schema 健康</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ScoreCircle score={schemaHealth?.score ?? 0} size={120} label="Schema 得分" />
            {(schemaHealth?.issues ?? []).map((i: string, idx: number) => (
              <div key={idx} className="text-sm text-amber-600 bg-amber-50 rounded px-3 py-1">{i}</div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setShowSchema(!showSchema)}>
              <Code className="h-3 w-3 mr-1" />{showSchema ? '隐藏' : '查看'} Schema
            </Button>
            {showSchema && schema && (
              <pre className="bg-zinc-900 text-green-400 text-xs p-3 rounded overflow-x-auto max-h-48">{JSON.stringify(schema, null, 2)}</pre>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trend + Associations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />品牌提及周趋势</CardTitle></CardHeader>
          <CardContent>
            <svg viewBox="0 0 300 120" className="w-full">
              {profile?.visibility.weeklyTrend && (() => {
                const pts = profile.visibility.weeklyTrend as Array<{ week: string; mentions: number }>;
                const max = Math.max(1, ...pts.map((p) => p.mentions));
                const polyline = pts.map((p, i) => `${20 + i * (260 / 3)},${110 - (p.mentions / max) * 90}`).join(' ');
                return <><polyline points={polyline} fill="none" stroke="#3b82f6" strokeWidth={2} />
                  {pts.map((p, i) => <circle key={i} cx={20 + i * (260 / 3)} cy={110 - (p.mentions / max) * 90} r={3} fill="#3b82f6" />)}
                  {pts.map((p, i) => <text key={i} x={20 + i * (260 / 3)} y={115} textAnchor="middle" className="text-[8px] fill-zinc-400">{p.week}:{p.mentions}</text>)}</>;
              })()}
            </svg>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Tag className="h-4 w-4" />品牌关联概念</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {(profile?.associations ?? []).map((a: { word: string; count: number }, i: number) => (
                <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600" style={{ fontSize: `${10 + Math.min(a.count, 10)}px` }}>
                  {a.word}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
