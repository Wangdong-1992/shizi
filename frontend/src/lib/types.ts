/**
 * API Response Type Definitions.
 *
 * Follows the management layer's unified response format:
 *   { code: number, data: T | null, message: string }
 */

import type { LucideIcon } from 'lucide-react';

// ---------------------------------------------------------------------------
// API Response Envelopes
// ---------------------------------------------------------------------------

/** Standard API response. */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

/** Paginated data payload. */
export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ---------------------------------------------------------------------------
// Auth Types
// ---------------------------------------------------------------------------

/** Operator info returned by login and /me endpoints. */
export interface Operator {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OPERATOR';
  isActive: boolean;
}

/** Login request body. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login response payload. */
export interface LoginResponse {
  token: string;
  operator: Operator;
}

// ---------------------------------------------------------------------------
// Client Types
// ---------------------------------------------------------------------------

/** Client (customer business) info. */
export interface Client {
  id: string;
  name: string;
  brandName: string | null;
  websiteUrl: string | null;
  industry: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Navigation Types
// ---------------------------------------------------------------------------

/** Navigation group item. */
export interface NavItem {
  icon: LucideIcon;
  label: string;
  href: string;
  active?: boolean;
  disabled?: boolean;
}

/** Navigation group. */
export interface NavGroup {
  label: string;
  items: NavItem[];
}

// ---------------------------------------------------------------------------
// Knowledge Types (Phase 2)
// ---------------------------------------------------------------------------

/** Knowledge entry. */
export interface KnowledgeEntry {
  id: string;
  clientId: string;
  category: string;
  title: string;
  content: string;
  contentHtml: string | null;
  source: string | null;
  confidence: number | null;
  riskLevel: string | null;
  version: number;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  geoflowKbId: string | null;
  geoflowSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Create knowledge entry request. */
export interface CreateKnowledgeRequest {
  title: string;
  category: string;
  content: string;
  contentHtml?: string;
  source?: string;
  confidence?: number;
  riskLevel?: 'low' | 'medium' | 'high';
}

/** Update knowledge entry request. */
export interface UpdateKnowledgeRequest {
  title?: string;
  category?: string;
  content?: string;
  contentHtml?: string;
  source?: string;
  confidence?: number;
  riskLevel?: 'low' | 'medium' | 'high';
}

/** Category statistics. */
export interface CategoryStats {
  category: string;
  label: string;
  total: number;
  draft: number;
  published: number;
}

/** Knowledge category display info. */
export interface KnowledgeCategory {
  category: string;
  label: string;
}
