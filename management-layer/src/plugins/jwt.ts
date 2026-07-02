/**
 * JWT Plugin — Sign, Verify, and Fastify Authentication Hook.
 *
 * This plugin provides:
 *   1. `fastify.jwt.sign(payload)` — signs a JWT with the shared secret
 *   2. `fastify.jwt.verify(token)` — verifies a JWT and returns the payload
 *   3. `fastify.verifyJwt` — a preHandler hook for route authentication
 *
 * P0-8 FIX: Supports JWT from both Authorization header and HttpOnly cookie.
 * The cookie is the preferred method (more secure, prevents XSS token theft).
 *
 * JWT Algorithm: HS256 (symmetric, shared with GEOFlow)
 * JWT Payload: { sub, role, client_id, iss: "geo-management", iat, exp }
 *
 * @see config/env.ts for JWT_SECRET
 * @see GEOFlow's ExternalJwtAuth middleware (validates the same tokens)
 */

import fp from 'fastify-plugin';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '../config/env.js';
import { errorResponse } from '../utils/response.js';

/**
 * Custom JWT payload interface.
 * Matches the payload validated by GEOFlow's ExternalJwtAuth middleware.
 */
export interface AppJwtPayload extends JwtPayload {
  /** Operator ID (UUID) — maps to JWT `sub` */
  sub: string;
  /** Operator role: "ADMIN" | "OPERATOR" */
  role: string;
  /** Current client UUID (for RLS context); null for ADMIN without active client */
  client_id: string | null;
  /** Issuer — always "geo-management" */
  iss: string;
}

/**
 * Authenticated user object attached to the request.
 */
export interface AuthUser {
  operatorId: string;
  role: string;
  clientId: string | null;
}

/**
 * JWT plugin decorator interface.
 */
export interface JwtPlugin {
  sign(payload: Omit<AppJwtPayload, 'iss' | 'iat' | 'exp'>): string;
  verify(token: string): AppJwtPayload;
  extractToken(request: FastifyRequest): string | null;
  verifyJwt(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  requireRole(...roles: string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

/**
 * Parse JWT_EXPIRES_IN (e.g., "24h", "7d", "3600s") into seconds.
 */
function parseExpiry(expiry: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) {
    return 86400; // Default 24 hours
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit] ?? 3600);
}

/**
 * JWT Fastify plugin.
 */
export default fp(async (fastify) => {
  const secret = env.JWT_SECRET;
  const issuer = env.JWT_ISSUER;
  const expiresIn = env.JWT_EXPIRES_IN;

  /**
   * Sign a JWT token.
   *
   * @param payload - The payload without iss, iat, exp (auto-generated)
   * @returns Signed JWT string
   */
  function sign(payload: Omit<AppJwtPayload, 'iss' | 'iat' | 'exp'>): string {
    const fullPayload: Partial<AppJwtPayload> = {
      ...payload,
      iss: issuer,
    };

    const options: SignOptions = {
      algorithm: 'HS256',
      expiresIn: expiresIn as any,
      issuer,
    };

    return jwt.sign(fullPayload, secret, options);
  }

  /**
   * Verify a JWT token and return the decoded payload.
   *
   * @param token - The JWT string to verify
   * @returns Decoded payload
   * @throws {TokenExpiredError} If token is expired
   * @throws {JsonWebTokenError} If token is invalid
   */
  function verify(token: string): AppJwtPayload {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer,
    });

    return decoded as AppJwtPayload;
  }

  /**
   * Parse cookies from the Cookie header.
   * @param cookieHeader - The value of the Cookie header
   * @returns Map of cookie name to value
   */
  function parseCookies(cookieHeader: string | undefined): Record<string, string> {
    if (!cookieHeader) return {};

    const cookies: Record<string, string> = {};
    for (const part of cookieHeader.split(';')) {
      const [name, ...rest] = part.split('=');
      if (name && rest.length > 0) {
        cookies[name.trim()] = decodeURIComponent(rest.join('=').trim());
      }
    }
    return cookies;
  }

  /**
   * Extract JWT token from request.
   * P0-8 FIX: Checks both Authorization header and cookie header.
   * Cookie is preferred (more secure, prevents XSS token theft).
   *
   * @param request - Fastify request object
   * @returns The JWT token string, or null if not found
   */
  function extractToken(request: FastifyRequest): string | null {
    // First, try to get from cookie (P0-8 fix - preferred method)
    // Parse manually to avoid dependency on @fastify/cookie
    const cookies = parseCookies(request.headers.cookie);
    const cookieToken = cookies['geo_token'];
    if (cookieToken) {
      return cookieToken;
    }

    // Fall back to Authorization header (for API clients, backward compatibility)
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const match = /^Bearer\s+(.+)$/i.exec(authHeader);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  /**
   * preHandler hook: extract and verify JWT from Authorization header or cookie.
   * P0-8 FIX: Now supports HttpOnly cookie for XSS protection.
   *
   * On success, attaches `request.user` with the authenticated user info.
   * On failure, returns 401 with an error response.
   */
  async function verifyJwt(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = extractToken(request);

    if (!token) {
      await reply.status(401).send(errorResponse(401, '未提供认证令牌'));
      return;
    }

    try {
      const payload = verify(token);

      // Attach user info to the request
      request.user = {
        operatorId: payload.sub,
        role: payload.role,
        clientId: payload.client_id ?? null,
      };
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        await reply.status(401).send(errorResponse(401, '认证令牌已过期'));
      } else {
        await reply.status(401).send(errorResponse(401, '认证令牌无效'));
      }
      return;
    }
  }

  /**
   * Role-based access control preHandler factory.
   *
   * Usage: `preHandler: [fastify.jwt.verifyJwt, fastify.jwt.requireRole('ADMIN')]`
   *
   * @param roles - Allowed roles (e.g., 'ADMIN', 'OPERATOR')
   * @returns A preHandler function
   */
  function requireRole(...roles: string[]): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      if (!request.user) {
        await reply.status(401).send(errorResponse(401, '未认证'));
        return;
      }

      if (!roles.includes(request.user.role)) {
        await reply.status(403).send(errorResponse(403, '无权限访问此资源'));
        return;
      }
    };
  }

  // Decorate the Fastify instance
  fastify.decorate('jwt', {
    sign,
    verify,
    extractToken,
    verifyJwt,
    requireRole,
  });
}, {
  name: 'jwt',
});

/**
 * TypeScript augmentation for FastifyInstance.
 */
declare module 'fastify' {
  interface FastifyInstance {
    jwt: JwtPlugin;
  }

  interface FastifyRequest {
    user?: AuthUser;
  }
}
