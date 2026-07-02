/**
 * Error Handling Utilities.
 *
 * Converts various error types (Prisma, JWT, Zod, generic) into
 * standardized API error responses.
 */

import { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';

import { errorResponse, errorResponseWithDetails, type ApiResponse } from './response.js';

/**
 * Result of error conversion: HTTP status code and response body.
 */
export interface ErrorResult {
  statusCode: number;
  response: ApiResponse<unknown>;
}

/**
 * Convert a thrown error into a standardized API error response.
 *
 * Handles:
 *   - PrismaClientKnownRequestError (P2002 unique constraint, P2025 not found)
 *   - TokenExpiredError → 401
 *   - JsonWebTokenError → 401
 *   - ZodError → 400 with field error details
 *   - AppError (custom) → uses custom code and message
 *   - Other errors → 500
 *
 * @param error - The caught error
 * @returns ErrorResult with status code and response body
 */
export function convertError(error: unknown): ErrorResult {
  // Custom application error
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      response: errorResponse(error.statusCode, error.message),
    };
  }

  // Zod validation error
  if (error instanceof ZodError) {
    const fieldErrors = error.flatten().fieldErrors;
    return {
      statusCode: 400,
      response: errorResponseWithDetails(400, '参数校验失败', fieldErrors),
    };
  }

  // Prisma known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return convertPrismaError(error);
  }

  // JWT errors
  if (error instanceof jwt.TokenExpiredError) {
    return {
      statusCode: 401,
      response: errorResponse(401, '认证令牌已过期'),
    };
  }

  if (error instanceof jwt.JsonWebTokenError) {
    return {
      statusCode: 401,
      response: errorResponse(401, '认证令牌无效'),
    };
  }

  // Log unknown errors for debugging
  if (process.env.NODE_ENV !== 'test') {
    console.error('[Unhandled Error]', error);
  }

  return {
    statusCode: 500,
    response: errorResponse(500, '服务器内部错误'),
  };
}

/**
 * Convert Prisma known request errors to API responses.
 */
function convertPrismaError(error: Prisma.PrismaClientKnownRequestError): ErrorResult {
  switch (error.code) {
    case 'P2002':
      // Unique constraint violation
      const target = error.meta?.target as string[] | undefined;
      const fields = target?.join(', ') ?? '记录';
      return {
        statusCode: 400,
        response: errorResponse(400, `${fields}已存在，请使用不同的值`),
      };

    case 'P2025':
      // Record not found
      return {
        statusCode: 404,
        response: errorResponse(404, '记录不存在'),
      };

    case 'P2003':
      // Foreign key constraint violation
      return {
        statusCode: 400,
        response: errorResponse(400, '存在关联数据，无法操作'),
      };

    case 'P2014':
      // Required relation violation
      return {
        statusCode: 400,
        response: errorResponse(400, '关联数据不匹配'),
      };

    default:
      return {
        statusCode: 500,
        response: errorResponse(500, '数据库操作失败'),
      };
  }
}

/**
 * Custom application error class.
 *
 * Throw this for expected business-logic errors (e.g., "operator not found",
 * "password incorrect"). The error handler converts it to an API response
 * with the specified status code.
 *
 * @example
 *   throw new AppError(404, '运营商不存在');
 *   throw new AppError(401, '邮箱或密码错误');
 *   throw new AppError(403, '账号已被停用');
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

/**
 * Common error factories for convenience.
 */
export const errors = {
  badRequest: (message: string = '请求参数无效'): AppError =>
    new AppError(400, message),

  unauthorized: (message: string = '未认证'): AppError =>
    new AppError(401, message),

  forbidden: (message: string = '无权限访问此资源'): AppError =>
    new AppError(403, message),

  notFound: (message: string = '记录不存在'): AppError =>
    new AppError(404, message),

  conflict: (message: string = '记录已存在'): AppError =>
    new AppError(409, message),

  internal: (message: string = '服务器内部错误'): AppError =>
    new AppError(500, message),
} as const;
