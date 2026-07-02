/**
 * Client CRUD Zod Schemas.
 *
 * Used for validating request bodies in client routes.
 */

import { z } from 'zod';

/**
 * Create client request body schema.
 *
 * @example
 *   {
 *     "name": "宿州禾润食品有限公司",
 *     "brandName": "禾润食品",
 *     "websiteUrl": "https://example.com",
 *     "industry": "食品制造"
 *   }
 */
export const createClientSchema = z.object({
  name: z
    .string()
    .min(1, '客户名称不能为空')
    .max(200, '客户名称不能超过 200 字符'),

  brandName: z
    .string()
    .max(100, '品牌名称不能超过 100 字符')
    .optional(),

  websiteUrl: z
    .string()
    .url('网站地址格式无效')
    .max(500, '网站地址不能超过 500 字符')
    .optional()
    .or(z.literal('')),

  industry: z
    .string()
    .max(100, '行业不能超过 100 字符')
    .optional(),
});

/**
 * Update client request body schema.
 * All fields are optional — only provided fields are updated.
 */
export const updateClientSchema = z.object({
  name: z
    .string()
    .min(1, '客户名称不能为空')
    .max(200, '客户名称不能超过 200 字符')
    .optional(),

  brandName: z
    .string()
    .max(100, '品牌名称不能超过 100 字符')
    .optional(),

  websiteUrl: z
    .string()
    .url('网站地址格式无效')
    .max(500, '网站地址不能超过 500 字符')
    .optional()
    .or(z.literal('')),

  industry: z
    .string()
    .max(100, '行业不能超过 100 字符')
    .optional(),

  isActive: z
    .boolean()
    .optional(),
});

/**
 * Client query parameters for pagination.
 */
export const clientQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  industry: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

/**
 * Types inferred from schemas.
 */
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ClientQuery = z.infer<typeof clientQuerySchema>;

/**
 * Client response shape.
 */
export interface ClientResponse {
  id: string;
  name: string;
  brandName: string | null;
  websiteUrl: string | null;
  industry: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
