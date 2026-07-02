/**
 * Authentication Request/Response Zod Schemas.
 *
 * Used for validating request bodies in auth routes.
 */

import { z } from 'zod';

/**
 * Login request body schema.
 *
 * @example
 *   { "email": "admin@geo-platform.com", "password": "admin123456" }
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '邮箱不能为空')
    .email('邮箱格式无效'),

  password: z
    .string()
    .min(1, '密码不能为空')
    .min(6, '密码至少 6 位'),
});

/**
 * Type for login request body (inferred from schema).
 */
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Login response shape (returned by auth.service).
 */
export interface LoginResponse {
  /** JWT token string */
  token: string;
  /** Operator info (without password hash) */
  operator: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  };
}

/**
 * Current user response shape (for GET /me).
 */
export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  clientId: string | null;
}
