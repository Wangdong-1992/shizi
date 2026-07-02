'use client';

/**
 * Dashboard Header — User info, role badge, and logout button.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getUser, clearAuth } from '@/lib/auth';
import type { Operator } from '@/lib/types';

type DashboardHeaderProps = {
  onToggleSidebar: () => void;
};

export function DashboardHeader({ onToggleSidebar }: DashboardHeaderProps): React.ReactElement {
  const router = useRouter();
  const [user, setUser] = useState<Operator | null>(null);

  useEffect(() => {
    setUser(getUser());
  }, []);

  function handleLogout(): void {
    clearAuth();
    router.push('/login');
  }

  // Get initials for avatar fallback
  const initials = user?.name
    ? user.name.slice(0, 2).toUpperCase()
    : '?';

  // Role badge styling
  const roleBadgeClass =
    user?.role === 'ADMIN'
      ? 'bg-blue-100 text-blue-700'
      : 'bg-zinc-100 text-zinc-700';

  const roleLabel = user?.role === 'ADMIN' ? '管理员' : '运营';

  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-4">
      {/* Left: sidebar toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Right: user info + logout */}
      <div className="flex items-center gap-3">
        {/* Role badge */}
        {user && (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${roleBadgeClass}`}>
            {roleLabel}
          </span>
        )}

        {/* User name */}
        <span className="text-sm font-medium text-zinc-700">
          {user?.name ?? '加载中...'}
        </span>

        {/* Avatar */}
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-blue-600 text-white text-xs">
            {initials}
          </AvatarFallback>
        </Avatar>

        {/* Logout */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="退出登录"
          title="退出登录"
        >
          <LogOut className="h-4 w-4 text-zinc-400 hover:text-red-500 transition-colors" />
        </Button>
      </div>
    </header>
  );
}
