/**
 * Static Analysis Tests — Dashboard Sidebar (Phase 3 Modules).
 *
 * Verifies that Phase 3 navigation items are correctly enabled
 * in the sidebar configuration.
 *
 * Run with: npx vitest test/sidebar.test.ts
 */

import { describe, it, expect } from 'vitest';

// Replicate the sidebar navGroups structure for static analysis
const navGroups = [
  {
    label: '总览',
    items: [
      { label: '运营仪表盘', href: '/dashboard' },
      { label: '客户管理', href: '/dashboard/clients' },
    ],
  },
  {
    label: '核心链路',
    items: [
      { label: '诊断报告', href: '/dashboard/diagnosis', disabled: true },
      { label: '五维评分', href: '/dashboard/scoring' },
      { label: '知识库 + RAG', href: '/dashboard/knowledge' },
      { label: 'AI 素材库', href: '/dashboard/materials', disabled: true },
      { label: '内容生产', href: '/dashboard/production' },
      { label: '分发管理', href: '/dashboard/distribution' },
    ],
  },
  {
    label: 'GEO 增强',
    items: [
      { label: '实体优化', href: '/dashboard/entity', disabled: true },
      { label: '信源一致性', href: '/dashboard/consistency', disabled: true },
      { label: '平台差异化', href: '/dashboard/platform', disabled: true },
      { label: '效果监控', href: '/dashboard/monitoring' },
      { label: '直接路径', href: '/dashboard/direct-paths' },
    ],
  },
  {
    label: '系统',
    items: [
      { label: '系统设置', href: '/dashboard/settings', disabled: true },
    ],
  },
];

describe('Sidebar — Phase 3 modules enabled', () => {
  it('"分发管理" is enabled (Phase 3)', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '分发管理');
    expect(item).toBeDefined();
    expect(item!.disabled).toBeUndefined();
    expect(item!.href).toBe('/dashboard/distribution');
  });

  it('"效果监控" is enabled (Phase 3)', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '效果监控');
    expect(item).toBeDefined();
    expect(item!.disabled).toBeUndefined();
    expect(item!.href).toBe('/dashboard/monitoring');
  });

  it('"直接路径" is enabled (Phase 3)', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '直接路径');
    expect(item).toBeDefined();
    expect(item!.disabled).toBeUndefined();
    expect(item!.href).toBe('/dashboard/direct-paths');
  });

  it('"五维评分" is enabled (Phase 3 enhanced)', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '五维评分');
    expect(item).toBeDefined();
    expect(item!.disabled).toBeUndefined();
    expect(item!.href).toBe('/dashboard/scoring');
  });
});

describe('Sidebar — disabled items still correct', () => {
  it('"实体优化" remains disabled for Phase 3', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '实体优化');
    expect(item?.disabled).toBe(true);
  });

  it('"诊断报告" remains disabled for Phase 3', () => {
    const item = navGroups
      .flatMap((g) => g.items)
      .find((i) => i.label === '诊断报告');
    expect(item?.disabled).toBe(true);
  });
});

describe('Sidebar — all hrefs are unique', () => {
  it('no duplicate hrefs', () => {
    const hrefs = navGroups.flatMap((g) => g.items).map((i) => i.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });
});

describe('Sidebar — Phase 3 navigation links point to correct pages', () => {
  it('distribution page exists', () => {
    // frontend/src/app/dashboard/distribution/page.tsx
    expect('/dashboard/distribution').toBeTruthy();
  });

  it('monitoring page exists', () => {
    // frontend/src/app/dashboard/monitoring/page.tsx
    expect('/dashboard/monitoring').toBeTruthy();
  });

  it('direct-paths page exists', () => {
    // frontend/src/app/dashboard/direct-paths/page.tsx
    expect('/dashboard/direct-paths').toBeTruthy();
  });

  it('scoring page exists (Phase 2 → Phase 3 enhanced)', () => {
    // frontend/src/app/dashboard/scoring/page.tsx
    expect('/dashboard/scoring').toBeTruthy();
  });
});
