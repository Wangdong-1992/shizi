'use client';

/**
 * Knowledge Base Editor — Main Page.
 *
 * Layout:
 *   ┌────────────┬──────────────────────────────────────────┐
 *   │ Category   │ Entry List (table)                       │
 *   │ Tree       │ - Title | Category | Status | Actions    │
 *   │ (240px)    │ - Pagination                             │
 *   │            ├──────────────────────────────────────────┤
 *   │            │ Quick Create / Edit (inline panel)       │
 *   └────────────┴──────────────────────────────────────────┘
 */

import { useEffect, useState, useCallback } from 'react';
import { Plus, Search, Send, Archive, FlaskConical, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CategoryTree, type CategoryNode } from '@/components/knowledge/category-tree';
import { api } from '@/lib/api';
import type {
  KnowledgeEntry,
  CategoryStats,
  CreateKnowledgeRequest,
  PaginatedData,
} from '@/lib/types';

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

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  published: '已发布',
  archived: '已归档',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
};

export default function KnowledgePage(): React.ReactElement {
  // State
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('enterprise_info');
  const [newContent, setNewContent] = useState('');

  // RAG test panel state
  const [ragQuery, setRagQuery] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragResults, setRagResults] = useState<Array<{
    entryId: string;
    title: string;
    category: string;
    chunkText: string;
    score: number;
    matchType: string;
  }> | null>(null);

  const pageSize = 20;

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    try {
      const data = await api.get<CategoryStats[]>('/knowledge/categories');
      setCategories(data);
    } catch {
      // categories will just be empty
    }
  }, []);

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (selectedCategory) params.category = selectedCategory;
      if (search.trim()) params.search = search.trim();

      const data = await api.get<PaginatedData<KnowledgeEntry>>('/knowledge', params);
      setEntries(data.items);
      setTotal(data.total);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, selectedCategory, search]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  // Create entry
  async function handleCreate(): Promise<void> {
    if (!newTitle.trim() || !newContent.trim()) return;
    setFormLoading(true);
    try {
      await api.post<KnowledgeEntry>('/knowledge', {
        title: newTitle.trim(),
        category: newCategory,
        content: newContent.trim(),
      });
      setNewTitle('');
      setNewContent('');
      setNewCategory('enterprise_info');
      setShowCreate(false);
      await fetchEntries();
      await fetchCategories();
    } catch {
      // handled by api.ts
    } finally {
      setFormLoading(false);
    }
  }

  // Publish
  async function handlePublish(id: string): Promise<void> {
    try {
      await api.post(`/knowledge/${id}/publish`);
      await fetchEntries();
      await fetchCategories();
    } catch {
      // handled by api.ts
    }
  }

  // Unpublish
  async function handleUnpublish(id: string): Promise<void> {
    try {
      await api.post(`/knowledge/${id}/unpublish`);
      await fetchEntries();
      await fetchCategories();
    } catch {
      // handled by api.ts
    }
  }

  // Delete
  async function handleDelete(id: string): Promise<void> {
    if (!confirm('确定删除该知识条目？此操作不可恢复。')) return;
    try {
      await api.delete(`/knowledge/${id}`);
      await fetchEntries();
      await fetchCategories();
    } catch {
      // handled by api.ts
    }
  }

  // RAG search
  async function handleRagSearch(): Promise<void> {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagResults(null);
    try {
      const data = await api.post<{ results: typeof ragResults; query: string; topScore: number }>(
        '/rag/search',
        { query: ragQuery.trim(), limit: 5 },
      );
      setRagResults(data.results);
    } catch {
      setRagResults([]);
    } finally {
      setRagLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">知识库 + RAG</h1>
          <p className="text-muted-foreground">管理企业知识条目，AI 自动切片、向量化、同步至 GEOFlow</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          新建知识条目
        </Button>
      </div>

      <div className="flex gap-6">
        {/* Left: Category Tree */}
        <Card className="w-56 flex-shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">分类筛选</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryTree
              categories={categories}
              selected={selectedCategory}
              onSelect={(cat) => {
                setSelectedCategory(cat);
                setPage(1);
              }}
            />
          </CardContent>
        </Card>

        {/* Right: Entry List */}
        <div className="flex-1 space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="搜索标题或内容..."
                className="pl-9"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Create Form */}
          {showCreate && (
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="pt-6 space-y-3">
                <Input
                  placeholder="标题"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px]"
                  placeholder="知识内容（支持 Markdown）..."
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
                  <Button onClick={handleCreate} disabled={formLoading}>
                    {formLoading ? '创建中...' : '创建'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entry Table */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-muted-foreground">加载中...</div>
              ) : entries.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {selectedCategory || search
                    ? '没有匹配的知识条目'
                    : '暂无知识条目，点击"新建知识条目"开始'}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b text-xs text-zinc-500">
                      <th className="text-left px-4 py-3 font-medium">标题</th>
                      <th className="text-left px-4 py-3 font-medium w-24">分类</th>
                      <th className="text-left px-4 py-3 font-medium w-20">状态</th>
                      <th className="text-right px-4 py-3 font-medium w-40">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm">{entry.title}</div>
                          <div className="text-xs text-zinc-400 mt-0.5 line-clamp-1">
                            {entry.content.slice(0, 80)}...
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs text-zinc-500">
                            {CATEGORY_LABELS[entry.category] ?? entry.category}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${STATUS_STYLES[entry.status] ?? ''}`}>
                            {STATUS_LABELS[entry.status] ?? entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-end">
                            {entry.status === 'draft' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handlePublish(entry.id)}
                              >
                                <Send className="h-3 w-3 mr-1" />发布
                              </Button>
                            )}
                            {entry.status === 'published' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => handleUnpublish(entry.id)}
                              >
                                <Archive className="h-3 w-3 mr-1" />取消发布
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-red-500 hover:text-red-700"
                              onClick={() => handleDelete(entry.id)}
                            >
                              删除
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Pagination */}
              {total > pageSize && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <span className="text-xs text-zinc-500">
                    共 {total} 条，第 {page} / {Math.ceil(total / pageSize)} 页
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      上一页
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={page >= Math.ceil(total / pageSize)}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* RAG Retrieval Test Panel */}
      <Card className="border-dashed border-amber-200 bg-amber-50/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-base text-amber-800">RAG 检索测试</CardTitle>
          </div>
          <CardDescription>
            输入自然语言查询，测试知识库 RAG 四路混合召回效果
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder='例如："水果罐头的保质期"、"黄桃罐头生产工艺"'
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRagSearch()}
            />
            <Button onClick={handleRagSearch} disabled={ragLoading} variant="secondary">
              <Zap className="h-4 w-4 mr-2" />
              {ragLoading ? '检索中...' : '检索'}
            </Button>
          </div>

          {ragResults !== null && (
            <div className="space-y-2">
              {ragResults.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  未找到匹配的知识条目
                </p>
              ) : (
                ragResults.map((r, i) => (
                  <div
                    key={`${r.entryId}-${i}`}
                    className="rounded-md border bg-white p-3 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{r.title}</span>
                      <span className="text-[11px] font-mono bg-zinc-100 px-1.5 py-0.5 rounded">
                        {(r.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span>{CATEGORY_LABELS[r.category] ?? r.category}</span>
                      <span>·</span>
                      <span className={
                        r.matchType === 'hybrid' ? 'text-green-600' :
                        r.matchType === 'keyword' ? 'text-blue-600' :
                        'text-purple-600'
                      }>
                        {r.matchType === 'hybrid' ? '混合召回' :
                         r.matchType === 'keyword' ? '关键词匹配' : '向量语义'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2">{r.chunkText}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
