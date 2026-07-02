/**
 * Authentication Service.
 *
 * Handles operator login (credential verification + JWT signing)
 * and current user retrieval.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';
import { AppError } from '../utils/error.js';
import type { LoginInput, LoginResponse, MeResponse } from '../schemas/auth.schema.js';

/**
 * Auth service dependencies.
 */
export interface AuthServiceDeps {
  prisma: PrismaClient;
}

/**
 * Create the authentication service.
 *
 * @param deps - Service dependencies (Prisma client)
 * @returns Auth service functions
 */
export function createAuthService(deps: AuthServiceDeps) {
  const { prisma } = deps;

  /**
   * Authenticate an operator by email and password.
   *
   * @param input - Login credentials (email, password)
   * @returns JWT token and operator info
   * @throws {AppError} 401 if credentials are invalid
   * @throws {AppError} 403 if account is disabled
   */
  async function login(input: LoginInput): Promise<LoginResponse> {
    // Find operator by email
    const operator = await prisma.operator.findUnique({
      where: { email: input.email },
    });

    // Operator not found — use generic message to prevent email enumeration
    if (!operator) {
      throw new AppError(401, '邮箱或密码错误');
    }

    // Check if account is active
    if (!operator.isActive) {
      throw new AppError(403, '账号已被停用，请联系管理员');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(input.password, operator.password);
    if (!isPasswordValid) {
      throw new AppError(401, '邮箱或密码错误');
    }

    // Sign JWT token
    // Note: client_id is null on login — it's set when the operator selects
    // a client to work with (future feature). GEOFlow's RLS will block
    // all business table queries until a client_id is set.
    //
    // Phase 1: client_id 为 null。通过 GEOFlow RLS 查询将返回 0 行。
    // Phase 2 添加客户端选择功能后，重新签发带 client_id 的 JWT。
    const token = signOperatorToken(operator.id, operator.role, null);

    return {
      token,
      operator: {
        id: operator.id,
        email: operator.email,
        name: operator.name,
        role: operator.role,
        isActive: operator.isActive,
      },
    };
  }

  /**
   * Get current operator info by ID.
   *
   * @param operatorId - The operator UUID
   * @returns Operator info without password hash
   * @throws {AppError} 404 if operator not found
   */
  async function getMe(operatorId: string, clientId: string | null): Promise<MeResponse> {
    const operator = await prisma.operator.findUnique({
      where: { id: operatorId },
    });

    if (!operator) {
      throw new AppError(404, '用户不存在');
    }

    return {
      id: operator.id,
      email: operator.email,
      name: operator.name,
      role: operator.role,
      isActive: operator.isActive,
      clientId,
    };
  }

  return {
    login,
    getMe,
  };
}

/**
 * Sign a JWT token for an operator.
 *
 * Exported for use by other services that need to re-issue tokens
 * (e.g., when switching active client).
 *
 * @param operatorId - Operator UUID
 * @param role - Operator role ("ADMIN" | "OPERATOR")
 * @param clientId - Current client UUID (null if no client selected)
 * @returns Signed JWT string
 */
export function signOperatorToken(
  operatorId: string,
  role: string,
  clientId: string | null,
): string {
  const payload = {
    sub: operatorId,
    role,
    client_id: clientId,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as any,
    issuer: env.JWT_ISSUER,
  });
}
