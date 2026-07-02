/**
 * API Client for GEO Platform Management Layer.
 *
 * P0-8 FIX: Authentication now uses HttpOnly cookie instead of Authorization header.
 * The browser automatically sends the cookie with each request - no manual token handling needed.
 *
 * Features:
 *   - No manual JWT handling (cookies are automatic)
 *   - Unified response handling (checks code field)
 *   - 401 interception → clears auth → redirects to /login
 *   - Typed responses via generics
 *
 * Usage:
 *   const result = await api.post<LoginResponse>('/auth/login', { email, password });
 *   const clients = await api.get<PaginatedData<Client>>('/clients', { page: 1 });
 */

import { clearAuth } from './auth';
import type { ApiResponse } from './types';

// ---------------------------------------------------------------------------
// Custom Error Classes
// ---------------------------------------------------------------------------

/** API error with code and message from the backend. */
export class ApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------------------------------------------------------------------------
// Request Helpers
// ---------------------------------------------------------------------------

const BASE_URL = '/api/v1';

/**
 * Build request headers.
 * P0-8 FIX: No manual Authorization header needed - browser sends HttpOnly cookie automatically.
 */
function buildHeaders(): Record<string, string> {
  // P0-8 FIX: Rely on HttpOnly cookie for authentication
  // Browser automatically sends cookies to the same origin
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Build a URL with query parameters.
 */
function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.pathname + url.search;
}

/**
 * Handle the API response: extract body, check code, handle errors.
 */
async function handleResponse<T>(response: Response): Promise<T> {
  let body: ApiResponse<T>;

  try {
    body = await response.json();
  } catch {
    throw new ApiError(response.status, '服务器返回了无效的响应');
  }

  // 401 → session expired or invalid token
  if (body.code === 401 || response.status === 401) {
    clearAuth();
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    throw new ApiError(401, body.message || '认证已过期，请重新登录');
  }

  // Non-200 → API error
  if (body.code !== 200) {
    throw new ApiError(body.code, body.message || '请求失败', body.data);
  }

  return body.data;
}

/**
 * Handle fetch errors (network issues, etc.).
 */
function handleFetchError(error: unknown): never {
  if (error instanceof ApiError) {
    throw error;
  }
  throw new ApiError(0, '网络请求失败，请检查网络连接');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const api = {
  /**
   * POST request with JSON body.
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const response = await fetch(buildUrl(path), {
        method: 'POST',
        headers: buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      return handleResponse<T>(response);
    } catch (error) {
      return handleFetchError(error);
    }
  },

  /**
   * GET request.
   */
  async get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    try {
      const response = await fetch(buildUrl(path, params), {
        method: 'GET',
        headers: buildHeaders(),
      });
      return handleResponse<T>(response);
    } catch (error) {
      return handleFetchError(error);
    }
  },

  /**
   * PUT request with JSON body.
   */
  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    try {
      const response = await fetch(buildUrl(path), {
        method: 'PUT',
        headers: buildHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      });
      return handleResponse<T>(response);
    } catch (error) {
      return handleFetchError(error);
    }
  },

  /**
   * DELETE request.
   */
  async delete<T = unknown>(path: string): Promise<T> {
    try {
      const response = await fetch(buildUrl(path), {
        method: 'DELETE',
        headers: buildHeaders(),
      });
      return handleResponse<T>(response);
    } catch (error) {
      return handleFetchError(error);
    }
  },
};

export default api;
