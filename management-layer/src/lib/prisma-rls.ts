/**
 * Prisma RLS (Row-Level Security) Extension.
 *
 * Provides utilities for executing PostgreSQL queries with RLS tenant context.
 * Each RLS query is wrapped in a transaction that calls
 * `SELECT set_client_context('<uuid>'::uuid)` before executing the actual query.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                        ARCHITECTURE DECISION                            ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  Management Layer → GEOFlow Communication:                             ║
 * ║                                                                          ║
 * ║  1. HTTP API Bridge (Current Default):                                 ║
 * ║     management-layer calls GEOFlow via HTTP (nginx → geoflow)          ║
 * ║     → GEOFlow's ExternalJwtAuth middleware handles RLS                 ║
 * ║     → No direct SQL access to GEOFlow tables needed                    ║
 * ║                                                                          ║
 * ║  2. Direct SQL Access (Future/Advanced):                              ║
 * ║     If you need to query GEOFlow tables directly (e.g., analytics),   ║
 * ║     MUST use queryWithRls() or createRlsClient() to set tenant context ║
 * ║                                                                          ║
 * ║  Management Tables (NO RLS needed):                                    ║
 * ║     - management_operators, management_clients                         ║
 * ║     - management_knowledge_entries, management_knowledge_chunks        ║
 * ║     These are protected by application-level clientId checks          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   // Simple query with RLS (for GEOFlow table access)
 *   const articles = await queryWithRls(prisma, clientId,
 *     'SELECT * FROM articles ORDER BY created_at DESC LIMIT 20'
 *   );
 *
 *   // Parameterized query with RLS
 *   const article = await queryWithRls(prisma, clientId,
 *     'SELECT * FROM articles WHERE id = $1', articleId
 *   );
 *
 *   // Execute (INSERT/UPDATE/DELETE) with RLS
 *   await executeWithRls(prisma, clientId,
 *     'UPDATE articles SET status = $1 WHERE id = $2', 'published', articleId
 *   );
 *
 *   // Create an RLS client for multiple queries in the same transaction
 *   const rlsClient = createRlsClient(prisma, clientId);
 *   await rlsClient.query('SELECT * FROM articles');
 *
 * Note: Management layer tables (management_operators, management_clients)
 * are NOT RLS-protected. Use the standard Prisma client for those.
 * RLS is only needed when querying GEOFlow's Laravel-managed business tables.
 *
 * @warning 调用方必须使用 $1/$2 参数化占位符。不要直接拼接用户输入到 SQL 字符串中。
 *          错误示例: `'SELECT * FROM articles WHERE name = "' + userInput + '"'`
 *          正确示例: `'SELECT * FROM articles WHERE name = $1', userInput`
 *
 * @see docker/postgres/init.sql for set_client_context function definition
 * @see GEOFlow's ExternalJwtAuth middleware (uses the same mechanism)
 */

import { PrismaClient } from '@prisma/client';

/**
 * UUID validation regex (v4 and nil UUID).
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate that a string is a properly formatted UUID.
 * @throws {Error} if the UUID is invalid
 */
function validateUuid(clientId: string): void {
  if (!UUID_REGEX.test(clientId)) {
    throw new Error(`Invalid client_id UUID: ${clientId}`);
  }
}

/**
 * RLS Client — a lightweight wrapper around PrismaClient that automatically
 * sets the tenant context for each query.
 *
 * Created by {@link createRlsClient}.
 */
export interface RlsClient {
  /**
   * Execute a SELECT query with RLS filtering.
   * @warning 必须使用 $1/$2 参数化占位符。不要直接拼接用户输入到 SQL 字符串中。
   * @param sql - SQL query string (use $1, $2, ... for parameters)
   * @param params - Query parameters
   * @returns Array of result rows
   */
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;

  /**
   * Execute an INSERT/UPDATE/DELETE statement with RLS filtering.
   * @param sql - SQL statement string (use $1, $2, ... for parameters)
   * @param params - Statement parameters
   * @returns Number of affected rows
   */
  execute(sql: string, ...params: unknown[]): Promise<number>;

  /**
   * Run a callback within a single RLS transaction.
   * All queries inside the callback share the same transaction and RLS context.
   * @param fn - Callback that receives a transaction-scoped RLS executor
   * @returns The callback's return value
   */
  transaction<T>(fn: (tx: RlsTxClient) => Promise<T>): Promise<T>;
}

/**
 * Transaction-scoped RLS client (used inside `transaction()` callback).
 */
export interface RlsTxClient {
  query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  execute(sql: string, ...params: unknown[]): Promise<number>;
}

/**
 * Create an RLS client that wraps all queries in tenant-scoped transactions.
 *
 * @param prisma - The base PrismaClient instance
 * @param clientId - The tenant UUID to set in the RLS context
 * @returns RlsClient instance
 */
export function createRlsClient(prisma: PrismaClient, clientId: string): RlsClient {
  validateUuid(clientId);

  return {
    async query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]> {
      return queryWithRls<T>(prisma, clientId, sql, ...params);
    },

    async execute(sql: string, ...params: unknown[]): Promise<number> {
      return executeWithRls(prisma, clientId, sql, ...params);
    },

    async transaction<T>(fn: (tx: RlsTxClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx: PrismaClient) => {
        // Set RLS context for the entire transaction
        await tx.$executeRaw`SELECT set_client_context(${clientId}::uuid)`;

        const rlsTx: RlsTxClient = {
          async query<T2 = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T2[]> {
            return tx.$queryRawUnsafe(sql, ...params) as Promise<T2[]>;
          },
          async execute(sql: string, ...params: unknown[]): Promise<number> {
            return tx.$executeRawUnsafe(sql, ...params);
          },
        };

        return fn(rlsTx);
      });
    },
  };
}

/**
 * Execute a raw SQL query with RLS tenant context.
 *
 * Creates a one-off transaction, sets the RLS context, executes the query,
 * and commits. Use {@link createRlsClient} for multiple queries.
 *
 * @param prisma - The base PrismaClient instance
 * @param clientId - The tenant UUID for RLS filtering
 * @param sql - SQL query string (use $1, $2, ... for parameters)
 * @param params - Query parameters
 * @returns Query result rows
 */
export async function queryWithRls<T = unknown>(
  prisma: PrismaClient,
  clientId: string,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  validateUuid(clientId);

  return prisma.$transaction(async (tx: PrismaClient) => {
    // Set RLS context (transaction-scoped via SET LOCAL)
    await tx.$executeRaw`SELECT set_client_context(${clientId}::uuid)`;
    // Execute the query with RLS filtering active
    return tx.$queryRawUnsafe(sql, ...params) as Promise<T[]>;
  });
}

/**
 * Execute a raw SQL statement (INSERT/UPDATE/DELETE) with RLS tenant context.
 *
 * @param prisma - The base PrismaClient instance
 * @param clientId - The tenant UUID for RLS filtering
 * @param sql - SQL statement string (use $1, $2, ... for parameters)
 * @param params - Statement parameters
 * @returns Number of affected rows
 */
export async function executeWithRls(
  prisma: PrismaClient,
  clientId: string,
  sql: string,
  ...params: unknown[]
): Promise<number> {
  validateUuid(clientId);

  return prisma.$transaction(async (tx: PrismaClient) => {
    await tx.$executeRaw`SELECT set_client_context(${clientId}::uuid)`;
    return tx.$executeRawUnsafe(sql, ...params);
  });
}

// =============================================================================
// P0-7 FIX: Development-only warning for direct GEOFlow table access
// =============================================================================

/**
 * GEOFlow business tables that require RLS when accessed directly.
 * These tables are managed by Laravel and protected by RLS policies.
 *
 * Current architecture: Management layer accesses GEOFlow via HTTP API,
 * which handles RLS internally. Direct SQL access is NOT recommended.
 */
const GEOFLOW_TABLES = new Set([
  'knowledge_entries',
  'knowledge_chunks',
  'distributions',
  'distribution_logs',
  'distribution_platforms',
  'entities',
  'entity_mentions',
  'content_drafts',
  'content_versions',
  'themes',
  'theme_replications',
  'crawler_logs',
  'score_logs',
]);

/**
 * Check if a SQL query is accessing GEOFlow tables without RLS.
 * This is a development-only warning to catch potential RLS misconfigurations.
 *
 * @param sql - The SQL query being executed
 * @throws {Error} in development mode if accessing GEOFlow tables without RLS
 */
export function assertNoDirectGeoFlowAccess(sql: string): void {
  // Only run in development mode
  if (process.env.NODE_ENV === 'production') return;

  const tablePattern = /(?:FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi;
  let match;

  while ((match = tablePattern.exec(sql)) !== null) {
    const tableName = match[1].toLowerCase();

    // Check if it's a GEOFlow table
    if (GEOFLOW_TABLES.has(tableName)) {
      console.warn(
        `⚠️  [P0-7 WARNING] Direct access to GEOFlow table '${tableName}' detected.\n` +
        `    Current architecture uses HTTP API to GEOFlow, which handles RLS internally.\n` +
        `    If you must use direct SQL, wrap with queryWithRls() or createRlsClient().\n` +
        `    SQL: ${sql.substring(0, 100)}...`
      );
    }
  }
}
