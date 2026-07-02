/**
 * Operator CRUD Zod Schemas.
 *
 * Used for validating request bodies in operator routes.
 */

import { z } from 'zod';

/**
 * Create operator request body schema.
 *
 * @example
 *   {
 *     "email": "operator@geo-platform.com",
 *     "password": "securePassword123",
 *     "name": "张三",
 *     "role": "OPERATOR"
 *   }
 */
export const createOperatorSchema = z.object({
  email: z
    .string()
    .min(1, '邮箱不能为空')
    .email('邮箱格式无效'),

  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(128, '密码不能超过 128 位'),

  name: z
    .string()
    .min(1, '姓名不能为空')
    .max(50, '姓名不能超过 50 字符'),

  role: z
    .enum(['ADMIN', 'OPERATOR'])
    .default('OPERATOR'),
});

/**
 * Update operator request body schema.
 * All fields are optional — only provided fields are updated.
 */
export const updateOperatorSchema = z.object({
  email: z
    .string()
    .email('邮箱格式无效')
    .optional(),

  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(128, '密码不能超过 128 位')
    .optional(),

  name: z
    .string()
    .min(1, '姓名不能为空')
    .max(50, '姓名不能超过 50 字符')
    .optional(),

  role: z
    .enum(['ADMIN', 'OPERATOR'])
    .optional(),

  isActive: z
    .boolean()
    .optional(),
});

/**
 * Operator query parameters for pagination.
 */
export const operatorQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.enum(['ADMIN', 'OPERATOR']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

/**
 * Types inferred from schemas.
 */
export type CreateOperatorInput = z.infer<typeof createOperatorSchema>;
export type UpdateOperatorInput = z.infer<typeof updateOperatorSchema>;
export type OperatorQuery = z.infer<typeof operatorQuerySchema>;

/**
 * Operator response shape (never includes password hash).
 */
export interface OperatorResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
