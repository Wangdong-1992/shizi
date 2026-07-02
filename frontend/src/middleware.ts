/**
 * Next.js Middleware — Route Guard.
 *
 * Reads the geo_token cookie to determine authentication state:
 *   - Unauthenticated → /dashboard/* → redirect to /login
 *   - Authenticated → /login → redirect to /dashboard
 *
 * P0-1 FIX: JWT signature verification (decode + expiry check).
 * The full HMAC signature verification requires the JWT_SECRET which is
 * server-side only. For the Edge middleware, we validate:
 *   1. Token is well-formed (3-part JWT structure)
 *   2. Token has not expired (exp claim check)
 * The API layer performs full signature verification on every request.
 * This middleware provides a defense-in-depth barrier against obviously
 * invalid tokens reaching protected routes.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Minimal JWT decode (no signature verification in Edge Runtime).
 * Extracts payload for expiry check only.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function isTokenValid(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || !payload.exp) return false;
  // Check expiration (exp is in seconds, Date.now() is in ms)
  const expMs = (payload.exp as number) * 1000;
  return Date.now() < expMs;
}

export function middleware(request: NextRequest): NextResponse {
  const rawToken = request.cookies.get('geo_token')?.value;
  const { pathname } = request.nextUrl;

  // Validate token: well-formed + not expired (P0-1 fix).
  // Full signature verification happens at the API layer on every request.
  const token = rawToken && isTokenValid(rawToken) ? rawToken : null;

  // Unauthenticated user trying to access dashboard → redirect to login
  if (pathname.startsWith('/dashboard') && !token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access login → redirect to dashboard
  if (pathname === '/login' && token) {
    const dashboardUrl = new URL('/dashboard', request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

/**
 * Match all routes except static files and API rewrites.
 */
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
