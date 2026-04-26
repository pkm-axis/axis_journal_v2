-- =========================================
-- SCHEMA PERMISSIONS MIGRATION
-- anon = read-only
-- authenticated = app usage (RLS enforced)
-- service_role = full access
-- =========================================


-- =========================================
-- SCHEMA USAGE
-- =========================================

GRANT USAGE ON SCHEMA trading TO anon, authenticated, service_role;
-- GRANT USAGE ON SCHEMA analytics TO anon, authenticated, service_role;


-- =========================================
-- ANON ROLE (READ ONLY)
-- =========================================

-- trading: read-only
GRANT SELECT ON ALL TABLES IN SCHEMA trading TO anon;

-- analytics: read-only
-- GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO anon;


-- =========================================
-- AUTHENTICATED ROLE (RLS CONTROLLED)
-- =========================================

-- trading full CRUD (RLS still applies)
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA trading
TO authenticated;

-- sequences (needed for inserts with serial/identity)
GRANT USAGE, SELECT, UPDATE
ON ALL SEQUENCES IN SCHEMA trading
TO authenticated;

-- functions (business logic allowed)
GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA trading
TO authenticated;

-- analytics read-only for users
-- GRANT SELECT
-- ON ALL TABLES IN SCHEMA analytics
-- TO authenticated;


-- =========================================
-- SERVICE ROLE (BYPASSES RLS)
-- =========================================

GRANT ALL
ON ALL TABLES IN SCHEMA trading
TO service_role;

-- GRANT ALL
-- ON ALL TABLES IN SCHEMA analytics
-- TO service_role;

GRANT ALL
ON ALL SEQUENCES IN SCHEMA trading
TO service_role;

-- GRANT ALL
-- ON ALL SEQUENCES IN SCHEMA analytics
-- TO service_role;

GRANT EXECUTE
ON ALL FUNCTIONS IN SCHEMA trading
TO service_role;


-- =========================================
-- DEFAULT PRIVILEGES
-- (IMPORTANT: applies to future objects)
-- =========================================

-- trading schema defaults
ALTER DEFAULT PRIVILEGES IN SCHEMA trading
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA trading
GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA trading
GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA trading
GRANT EXECUTE ON FUNCTIONS TO authenticated;


-- analytics schema defaults (read-only)
-- ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
-- GRANT SELECT ON TABLES TO anon, authenticated;