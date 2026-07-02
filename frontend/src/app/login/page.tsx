'use client';

/**
 * Login Page.
 *
 * Renders a centered login card with email/password form.
 * On successful login, stores credentials and redirects to /dashboard.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Layers } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { setAuth } from '@/lib/auth';
import type { LoginResponse, Operator } from '@/lib/types';

export default function LoginPage(): React.ReactElement {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError('');

    // Client-side validation
    if (!email.trim()) {
      setError('请输入邮箱地址');
      return;
    }
    if (!password.trim()) {
      setError('请输入密码');
      return;
    }

    setLoading(true);

    try {
      const data = await api.post<LoginResponse>('/auth/login', {
        email: email.trim(),
        password,
      });

      const operator: Operator = {
        id: data.operator.id,
        email: data.operator.email,
        name: data.operator.name,
        role: data.operator.role,
        isActive: data.operator.isActive,
      };

      // Store auth data
      setAuth(data.token, operator);

      // Navigate to dashboard
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('登录失败，请重试');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-sm">
        {/* Header */}
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <Layers className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl">GEO 平台</CardTitle>
          <CardDescription>运营商工作台</CardDescription>
        </CardHeader>

        {/* Form */}
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@geo-platform.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                autoFocus
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete="current-password"
              />
            </div>

            {/* Submit */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? '登录中...' : '登 录'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
