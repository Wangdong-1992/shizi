/**
 * Category Tree Component.
 *
 * Displays the 10 knowledge categories as a navigable tree.
 * Each category shows: icon | label | entry count
 * Clicking a category highlights it (used for filtering).
 */

'use client';

import { cn } from '@/lib/utils';
import {
  Building2,
  Package,
  Cog,
  Award,
  MessageCircle,
  BookOpen,
  Phone,
  Newspaper,
  Users,
  Tag,
} from 'lucide-react';

export interface CategoryNode {
  category: string;
  label: string;
  total: number;
  published: number;
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  enterprise_info: Building2,
  product_info: Package,
  process: Cog,
  certification: Award,
  faq: MessageCircle,
  industry_knowledge: BookOpen,
  contact: Phone,
  news: Newspaper,
  customer_case: Users,
  core_attributes: Tag,
};

type CategoryTreeProps = {
  categories: CategoryNode[];
  selected: string | null;
  onSelect: (category: string | null) => void;
};

export function CategoryTree({ categories, selected, onSelect }: CategoryTreeProps): React.ReactElement {
  return (
    <div className="space-y-1">
      {/* All categories */}
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left',
          selected === null
            ? 'bg-blue-50 text-blue-700 font-medium'
            : 'text-zinc-600 hover:bg-zinc-100',
        )}
      >
        <BookOpen className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">全部分类</span>
        <span className="text-xs text-zinc-400 tabular-nums">
          {categories.reduce((s, c) => s + c.total, 0)}
        </span>
      </button>

      {/* Individual categories */}
      {categories.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.category] ?? BookOpen;
        const isSelected = selected === cat.category;

        return (
          <button
            key={cat.category}
            onClick={() => onSelect(isSelected ? null : cat.category)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors text-left',
              isSelected
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-zinc-600 hover:bg-zinc-100',
            )}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 truncate">{cat.label}</span>
            <span className="text-xs text-zinc-400 tabular-nums">{cat.total}</span>
          </button>
        );
      })}
    </div>
  );
}
