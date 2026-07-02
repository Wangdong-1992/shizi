'use client';

/**
 * Smart Import Page — Five-stage pipeline UI.
 *
 * Features:
 *   - Drag-and-drop file upload (PDF/Word) or URL input
 *   - Real-time progress bar (polling GET /api/v1/import/:jobId/progress)
 *   - Review panel: structured entries + conflict annotations
 *   - Confirm button → batch create knowledge entries
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Upload, Link, Loader2, CheckCircle, AlertTriangle, XCircle, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';

const STAGE_LABELS: Record<number, string> = {
  1: '正在提取文本...',
  2: '正在清洗去噪...',
  3: '正在结构化整理...',
  4: '正在 AI 校验...',
  5: '生成审阅稿...',
};

type ProgressData = {
  jobId: string; stage: number; stageLabel: string; progress: number; status: string;
};

type ConflictInfo = { field: string; source1: string; source2: string; description: string };
type ReviewEntry = {
  title: string; category: string; content: string; confidence: number;
  conflicts: ConflictInfo[]; needsManualReview: boolean;
};
type ReviewData = {
  jobId: string; entries: ReviewEntry[]; globalMissingFields: string[];
  methodPath: { collect: string; clean: string; structure: string; verify: string };
};

const CATEGORY_LABELS: Record<string, string> = {
  enterprise_info: '企业信息', product_info: '产品信息', process: '工艺流程',
  certification: '资质认证', faq: '常见问答', industry_knowledge: '行业知识',
  contact: '联系方式', news: '新闻动态', customer_case: '客户案例', core_attributes: '核心属性',
};

export default function ImportPage(): React.ReactElement {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Poll progress
  useEffect(() => {
    if (!jobId || progress?.status === 'completed' || progress?.status === 'failed') return;

    const timer = setInterval(async () => {
      try {
        const data = await api.get<ProgressData>(`/import/${jobId}/progress`);
        setProgress(data);
        if (data.status === 'completed') {
          clearInterval(timer);
          fetchReview();
        }
        if (data.status === 'failed') {
          clearInterval(timer);
        }
      } catch { /* keep polling */ }
    }, 3000);

    return () => clearInterval(timer);
  }, [jobId, progress?.status]);

  async function fetchReview(): Promise<void> {
    if (!jobId) return;
    try {
      const data = await api.get<ReviewData>(`/import/${jobId}/result`);
      setReview(data);
    } catch { /* ignore */ }
  }

  async function handleFileUpload(file: File): Promise<void> {
    setLoading(true);
    setProgress(null);
    setReview(null);
    setConfirmed(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await api.post<{ jobId: string }>('/import/upload', formData);
      setJobId(data.jobId);
      setProgress({ jobId: data.jobId, stage: 0, stageLabel: 'pending', progress: 0, status: 'processing' });
    } finally {
      setLoading(false);
    }
  }

  async function handleUrlSubmit(): Promise<void> {
    if (!url.trim()) return;
    setLoading(true);
    setProgress(null);
    setReview(null);
    setConfirmed(false);

    try {
      const data = await api.post<{ jobId: string }>('/import/url', { url: url.trim() });
      setJobId(data.jobId);
      setProgress({ jobId: data.jobId, stage: 0, stageLabel: 'pending', progress: 0, status: 'processing' });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!jobId) return;
    setLoading(true);
    try {
      const data = await api.post<{ created: number }>(`/import/${jobId}/confirm`);
      setConfirmed(true);
      alert(`成功导入 ${data.created} 个知识条目！`);
      router.push('/dashboard/knowledge');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/knowledge')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">智能导入</h1>
          <p className="text-sm text-muted-foreground">AI 驱动五阶段流水线：提取 → 清洗 → 结构化 → 校验 → 审阅</p>
        </div>
      </div>

      {/* Input area */}
      {!jobId && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* File upload */}
          <Card
            className={`border-2 border-dashed cursor-pointer transition-colors ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-zinc-200'}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
              <Upload className="h-8 w-8 text-zinc-400" />
              <p className="text-sm font-medium">上传 PDF / Word 文件</p>
              <p className="text-xs text-zinc-400">拖拽文件到此处，或点击选择</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </CardContent>
          </Card>

          {/* URL input */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Link className="h-4 w-4" />网页导入
              </CardTitle>
              <CardDescription>输入网页 URL，自动提取正文内容</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Button onClick={handleUrlSubmit} disabled={loading || !url.trim()} className="w-full">
                {loading ? '提交中...' : '开始导入'}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Progress bar */}
      {progress && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {progress.status === 'failed' ? '导入失败' :
               progress.status === 'completed' ? '处理完成' : '处理中...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Progress bar */}
            <div className="w-full bg-zinc-100 rounded-full h-3 mb-3">
              <div
                className={`h-3 rounded-full transition-all duration-700 ${
                  progress.status === 'failed' ? 'bg-red-500' :
                  progress.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <p className="text-sm text-zinc-600">
              {progress.status === 'failed'
                ? '处理过程中出现错误，请重试'
                : STAGE_LABELS[progress.stage] ?? '等待中...'}
            </p>
            {progress.status === 'completed' && !review && (
              <div className="flex items-center gap-2 mt-2 text-sm text-zinc-400">
                <Loader2 className="h-3 w-3 animate-spin" />正在加载审阅稿...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review panel */}
      {review && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">审阅稿</h2>
            <Button onClick={handleConfirm} disabled={loading || confirmed} variant="default">
              <CheckCircle className="h-4 w-4 mr-2" />
              {confirmed ? '已确认' : '确认导入'}
            </Button>
          </div>

          {/* Global missing fields */}
          {review.globalMissingFields.length > 0 && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              检测到缺失字段：{review.globalMissingFields.join('、')}
            </div>
          )}

          {/* Entries */}
          <div className="space-y-3">
            {review.entries.map((entry, i) => (
              <Card key={i} className={entry.needsManualReview ? 'border-red-200' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {entry.title}
                      {entry.needsManualReview && (
                        <span className="ml-2 text-[11px] font-normal px-1.5 py-0.5 rounded bg-red-100 text-red-600">
                          需人工审核
                        </span>
                      )}
                    </CardTitle>
                    <span className="text-xs text-zinc-400 font-mono">
                      {(entry.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <CardDescription>
                    {CATEGORY_LABELS[entry.category] ?? entry.category}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-zinc-600 line-clamp-3">{entry.content}</p>

                  {/* Conflicts */}
                  {entry.conflicts.map((c, j) => (
                    <div key={j} className="text-xs bg-red-50 border border-red-100 rounded p-2">
                      <XCircle className="h-3 w-3 inline text-red-500 mr-1" />
                      <strong>{c.field}</strong>：{c.description}
                      <span className="text-zinc-400 ml-1">({c.source1} ↔ {c.source2})</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Empty state */}
          {review.entries.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              未从内容中识别到结构化条目
            </p>
          )}
        </div>
      )}
    </div>
  );
}
