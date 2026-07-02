-- =============================================================================
-- GEO Platform — PostgreSQL Initialization Script
-- =============================================================================
-- Executed automatically on first container startup (via docker-entrypoint-initdb.d).
-- Creates extensions and RLS helper functions for multi-tenant isolation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extension: pgvector — for AI embedding vector similarity search
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- -----------------------------------------------------------------------------
-- Extension: uuid-ossp — for UUID generation (uuid_generate_v4, etc.)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- RLS (Row-Level Security) Helper Functions
-- =============================================================================
-- Architecture:
--   - The application layer sets the client (tenant) context via
--     `SELECT set_client_context('<client_uuid>')` at the start of each
--     transaction or connection.
--   - RLS policies on tenant-scoped tables use `get_client_context()` to
--     filter rows by the current client.
--   - The setting is transaction-scoped (SET LOCAL), meaning it is
--     automatically cleared on COMMIT or ROLLBACK.
--   - Security default: if `app.client_id` is not set, `get_client_context()`
--     returns NULL, and all RLS-protected tables return 0 rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function: set_client_context(p_client_id UUID)
-- Purpose: Set the current client (tenant) context for RLS filtering.
-- Scope:   Transaction-level (is_local = true → uses SET LOCAL semantics).
-- Usage:   SELECT set_client_context('00000000-0000-0000-0000-000000000000');
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_client_context(p_client_id UUID)
RETURNS VOID
AS $$
BEGIN
    PERFORM set_config('app.client_id', p_client_id::text, true);
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog;

-- -----------------------------------------------------------------------------
-- Function: get_client_context()
-- Purpose: Retrieve the current client (tenant) UUID from session/transaction
--          settings. Returns NULL if not set (safe default → 0 rows on
--          RLS-protected tables).
-- Scope:   Reads the transaction-local setting first, falling back to session.
-- Usage:   SELECT get_client_context();
--          — Also used inside RLS policy definitions, e.g.:
--            CREATE POLICY tenant_isolation ON some_table
--            USING (client_id = get_client_context());
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_client_context()
RETURNS UUID
AS $$
BEGIN
    RETURN NULLIF(current_setting('app.client_id', true), '')::UUID;
END;
$$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog;

-- -----------------------------------------------------------------------------
-- Grant execute permissions to all roles (the application connects as a
-- standard user; these functions are SECURITY DEFINER so they run with the
-- owner's privileges safely).
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION set_client_context(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION get_client_context() TO PUBLIC;

-- -----------------------------------------------------------------------------
-- Verification (visible in container logs on first startup)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE 'GEO Platform PostgreSQL initialization complete.';
    RAISE NOTICE 'Extensions installed: vector, uuid-ossp';
    RAISE NOTICE 'RLS helper functions created: set_client_context(UUID), get_client_context()';
END;
$$;
