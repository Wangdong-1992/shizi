'use client';

/**
 * Knowledge Entry Detail / Edit Page.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, Archive, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { KnowledgeEntry, UpdateKnowledgeRequest } from '@/lib/types';

const CATEGORY_LABELS: Record<string, string> = {
  enterprise_info: '企业信息',
  product_info: '产品信息',
  process: '工艺流程',
  certification: '资质认证',
  faq: '常见问答',
  industry_knowledge: '行业知识',
  contact: '联系方式',
  news: '新闻动态',
  customer_case: '客户案例',
  core_attributes: '核心属性',
};

const STATUS_LABELS: Record<string, string> = { draft: '草稿', published: '已发布', archived: '已归档' };
const STATUS_STYLES: Record<string, string> = { draft: 'bg-zinc-100 text-zinc-600', published: 'bg-green-100 text-green-700', archived: 'bg-yellow-100 text-yellow-700' };

export default function KnowledgeDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [entry, setEntry] = useState<KnowledgeEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('enterprise_info');
  const [content, setContent] = useState('');

  useEffect(() => {
    async function fetch(): Promise<void> {
      try {
        const data = await api.get<KnowledgeEntry>(`/knowledge/${id}`);
        setEntry(data);
        setTitle(data.title);
        setCategory(data.category);
        setContent(data.content);
      } catch {
        router.push('/dashboard/knowledge');
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [id, router]);

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const body: UpdateKnowledgeRequest = { title, category, content };
      const updated = await api.put<KnowledgeEntry>(`/knowledge/${id}`, body);
      setEntry(updated);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(): Promise<void> {
    setActionLoading(true);
    try {
      const updated = await api.post<KnowledgeEntry>(`/knowledge/${id}/publish`);
      setEntry(updated);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnpublish(): Promise<void> {
    setActionLoading(true);
    try {
      const updated = await api.post<KnowledgeEntry>(`/knowledge/${id}/unpublish`);
      setEntry(updated);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">加载中...</div>;
  }

  if (!entry) {
    return <div className="p-8 text-center text-muted-foreground">条目不存在</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/knowledge')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{entry.title}</h1>
            <p className="text-sm text-muted-foreground">
              {CATEGORY_LABELS[entry.category] ?? entry.category}
              {' · '}
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${STATUS_STYLES[entry.status] ?? ''}`}>
                {STATUS_LABELS[entry.status] ?? entry.status}
              </span>
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {entry.status === 'draft' && (
            <Button onClick={handlePublish} disabled={actionLoading} variant="default">
              <Send className="h-4 w-4 mr-2" />发布
            </Button>
          )}
          {entry.status === 'published' && (
            <Button onClick={handleUnpublish} disabled={actionLoading} variant="outline">
              <Archive className="h-4 w-4 mr-2" />取消发布
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">编辑</CardTitle>
          <CardDescription>修改标题、分类或内容后点击保存</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
          />
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <textarea
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[300px] font-mono"
            placeholder="知识内容（支持 Markdown）..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Meta */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">元信息</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-zinc-500">版本</dt>
              <dd>{entry.version}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">发布时间</dt>
              <dd>{entry.publishedAt ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">GEOFlow 同步</dt>
              <dd>{entry.geoflowKbId ? '已同步' : '未同步'}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">创建时间</dt>
              <dd>{new Date(entry.createdAt).toLocaleString('zh-CN')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
