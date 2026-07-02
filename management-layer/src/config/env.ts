/**
 * Environment variable loading and validation using Zod.
 *
 * All env vars are validated at startup — the process exits if required
 * variables are missing or invalid.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

/**
 * Zod schema for environment variables.
 * Provides type-safe access with validation and defaults.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_ISSUER: z.string().default('geo-management'),

  GEOFLOW_API_URL: z.string().url().default('http://nginx/api'),

  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:8080'),

  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
});

/**
 * Parsed and validated environment variables.
 * Access via `import { env } from './config/env.js'`.
 */
export const env = (() => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
})();

/**
 * Derived configuration values.
 */
export const config = {
  isProduction: env.NODE_ENV === 'production',
  isDevelopment: env.NODE_ENV === 'development',
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
} as const;

export type Env = typeof env;
export type Config = typeof config;
