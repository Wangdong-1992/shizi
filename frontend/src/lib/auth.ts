/**
 * Authentication Utilities.
 *
 * P0-8 FIX: JWT is now stored in HttpOnly cookie (set by server on login).
 * User info is still stored in localStorage for display purposes.
 * Token is automatically sent by browser with each request - no manual handling needed.
 *
 * Storage keys:
 *   - HttpOnly cookie (server-set): geo_token (secure, XSS-proof)
 *   - localStorage: geo_user (for displaying user info only)
 */

import type { Operator } from './types';

const USER_KEY = 'geo_user';

/**
 * Get the stored user info from localStorage.
 * Note: Token is handled automatically by browser via HttpOnly cookie.
 */
export function getUser(): Operator | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Operator) : null;
  } catch {
    return null;
  }
}

/**
 * Store user info after successful login.
 * Note: Token is set by server via HttpOnly cookie - not stored here.
 *
 * @param _token - Deprecated parameter, kept for backward compatibility
 * @param user - Operator info to store in localStorage
 */
export function setAuth(_token: string, user: Operator): void {
  if (typeof window === 'undefined') return;

  // Only store user info in localStorage (token is in HttpOnly cookie)
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Clear all authentication data.
 * Note: Token cookie is cleared by calling /auth/logout API.
 */
export function clearAuth(): void {
  if (typeof window === 'undefined') return;

  // Clear user info from localStorage
  localStorage.removeItem(USER_KEY);

  // Token cookie will be cleared by the logout API call
}

/**
 * Check if the user is authenticated.
 * Checks for user info in localStorage (token is HttpOnly, can't check directly).
 */
export function isAuthenticated(): boolean {
  return getUser() !== null;
}
