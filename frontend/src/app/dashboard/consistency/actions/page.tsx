'use client';

/**
 * Consistency Actions Page.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, XCircle, Clock, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

type Action = { id: string; consistencyId: string; priority: string; action: string; status: string; note: string | null; createdAt: string };

const PRIORITY_STYLE: Record<string, string> = { P0: 'bg-red-600 text-white', P1: 'bg-amber-500 text-white', P2: 'bg-zinc-200 text-zinc-700' };
const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = { pending: Clock, in_progress: Play, done: CheckCircle, dismissed: XCircle };

export default function ActionsPage(): React.ReactElement {
  const router = useRouter();
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Action[]>('/consistency/actions').then(setActions).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function updateStatus(id: string, status: string): Promise<void> {
    await api.put(`/consistency/actions/${id}`, { status });
    setActions((prev) => prev.map((a) => a.id === id ? { ...a, status } : a));
  }

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/consistency')}><ArrowLeft className="h-4 w-4" /></Button>
        <div><h1 className="text-xl font-bold">行动项</h1><p className="text-sm text-muted-foreground">解决信源一致性问题</p></div>
      </div>
      <div className="space-y-2">
        {actions.map((a) => {
          const Icon = STATUS_ICON[a.status] ?? Clock;
          return (
            <Card key={a.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${PRIORITY_STYLE[a.priority]}`}>{a.priority}</span>
                  <div>
                    <p className="text-sm font-medium">{a.action}</p>
                    {a.note && <p className="text-xs text-zinc-400">{a.note}</p>}
                    <p className="text-[10px] text-zinc-400 mt-0.5">{new Date(a.createdAt).toLocaleString('zh-CN')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {['pending', 'in_progress', 'done'].map((s) => (
                    <Button key={s} variant={a.status === s ? 'default' : 'outline'} size="sm" className="h-7 text-xs"
                      onClick={() => updateStatus(a.id, s)} disabled={a.status === s}>
                      {s === 'pending' ? '待处理' : s === 'in_progress' ? '处理中' : '完成'}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
        {actions.length === 0 && <div className="py-8 text-center text-muted-foreground">暂无行动项</div>}
      </div>
    </div>
  );
}
