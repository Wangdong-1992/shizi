'use client';

/**
 * Content Draft Detail / Edit Page.
 *
 * Shows: content preview, FAQ schema, RAG references, review button.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Code, ExternalLink, FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ReviewChecklist, type ChecklistResult } from '@/components/production/review-checklist';
import { api } from '@/lib/api';
import type { ApiResponse } from '@/lib/types';

type DraftDetail = {
  id: string;
  title: string;
  content: string;
  format: string;
  schemaJson: Record<string, unknown> | null;
  status: string;
  geoScore: number | null;
  aiRatio: number | null;
  words: number | null;
  origResearchTypes: string[];
  factRefs: Array<{ entryId: string; entryTitle: string; chunkIndex: number; score: number }> | null;
  reviews: Array<{ passed: boolean; signature: string; reviewedAt: string; checklist: Record<string, { passed: boolean; reason?: string }> }>;
  createdAt: string;
};

export default function ProductionDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [draft, setDraft] = useState<DraftDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSchema, setShowSchema] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetch(): Promise<void> {
      try {
        const data = await api.get<DraftDetail>(`/content/${id}`);
        setDraft(data);
      } catch {
        router.push('/dashboard/production');
      } finally {
        setLoading(false);
      }
    }
    fetch();

    // Poll while generating
    const timer = setInterval(async () => {
      try {
        const data = await api.get<{ status: string }>(`/content/${id}/generation-status`);
        if (data.status !== 'generating') {
          clearInterval(timer);
          // Reload full detail
          const full = await api.get<DraftDetail>(`/content/${id}`);
          setDraft(full);
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => clearInterval(timer);
  }, [id, router]);

  async function handleSubmitReview(checklist: ChecklistResult, signature: string): Promise<void> {
    setSubmitting(true);
    try {
      const result = await api.post<{ passed: boolean }>(`/review/${id}/submit`, {
        checklist,
        signature,
      });
      // Reload
      const full = await api.get<DraftDetail>(`/content/${id}`);
      setDraft(full);
      alert(result.passed ? '审核已通过！' : '审核已提交（未通过）');
    } catch {
      // error handled by api.ts
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
  if (!draft) return <div className="p-8 text-center text-muted-foreground">草稿不存在</div>;

  const latestReview = draft.reviews?.[0];
  const isReviewable = draft.status === 'review';
  const isReviewed = draft.status === 'approved' || draft.status === 'rejected';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/production')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{draft.title}</h1>
          <p className="text-sm text-muted-foreground">
            {draft.words ? `${draft.words} 字` : ''}
            {draft.aiRatio !== null ? ` · AI 占比 ${draft.aiRatio}%` : ''}
            {draft.geoScore !== null ? ` · GEO 评分 ${draft.geoScore}` : ''}
          </p>
        </div>
      </div>

      {/* Status banner */}
      {isReviewed && (
        <div className={`rounded-lg p-4 text-sm font-medium ${
          draft.status === 'approved'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {draft.status === 'approved'
            ? `✅ 已通过人审 · 签署人: ${latestReview?.signature ?? '—'}`
            : `❌ 审核未通过 · 签署人: ${latestReview?.signature ?? '—'}`}
        </div>
      )}

      {/* Content preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">生成内容</CardTitle>
            <div className="flex gap-2">
              {draft.schemaJson && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSchema(!showSchema)}>
                  <Code className="h-3 w-3 mr-1" />{showSchema ? '隐藏' : '查看'} Schema
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Schema preview */}
          {showSchema && draft.schemaJson && (
            <div className="mb-4 rounded-md bg-zinc-900 p-4 overflow-x-auto">
              <pre className="text-xs text-green-400">{JSON.stringify(draft.schemaJson, null, 2)}</pre>
            </div>
          )}
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
            {draft.content || <span className="text-zinc-400">内容生成中...</span>}
          </div>
        </CardContent>
      </Card>

      {/* RAG References */}
      {draft.factRefs && draft.factRefs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4" />知识库证据引用
            </CardTitle>
            <CardDescription>AI 生成时使用的 RAG 检索结果</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {draft.factRefs.map((ref, i) => (
                <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                  <div>
                    <span className="font-medium">{ref.entryTitle}</span>
                    <span className="text-zinc-400 ml-2 text-xs">#{ref.chunkIndex}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-zinc-400">{(ref.score * 100).toFixed(0)}%</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => router.push(`/dashboard/knowledge/${ref.entryId}`)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review section */}
      {isReviewable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">提交审核</CardTitle>
          </CardHeader>
          <CardContent>
            <ReviewChecklist
              onSubmit={handleSubmitReview}
              submitting={submitting}
            />
          </CardContent>
        </Card>
      )}

      {/* Review history */}
      {draft.reviews && draft.reviews.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">审核记录</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {draft.reviews.map((rev, i) => (
                <div key={i} className={`rounded-md border p-3 text-sm ${
                  rev.passed ? 'border-green-200 bg-green-50/30' : 'border-red-200 bg-red-50/30'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {rev.passed ? '✅ 通过' : '❌ 未通过'} · 签署人: {rev.signature}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(rev.reviewedAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(rev.checklist).map(([dim, item]) => (
                      <div key={dim} className={item.passed ? 'text-green-700' : 'text-red-600'}>
                        {item.passed ? '✓' : '✗'} {dim}
                        {!item.passed && item.reason && `: ${item.reason}`}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
