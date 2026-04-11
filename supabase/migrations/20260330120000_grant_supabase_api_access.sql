-- PostgREST uses roles `anon` and `authenticated` (JWT). Without GRANT USAGE ON SCHEMA,
-- you get: "permission denied for schema trading".
-- RLS policies still enforce row access; this only allows the API roles to reach the schema/tables.
-- Also expose `trading` (and `app`, `analytics` if needed) under Project Settings → API → Exposed schemas.

grant usage on schema app to anon, authenticated, service_role;
grant all on all tables in schema app to anon, authenticated, service_role;
grant all on all sequences in schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

grant usage on schema trading to anon, authenticated, service_role;
grant all on all tables in schema trading to anon, authenticated, service_role;
grant all on all sequences in schema trading to anon, authenticated, service_role;

grant usage on schema analytics to anon, authenticated, service_role;
grant select on all tables in schema analytics to anon, authenticated, service_role;

alter default privileges in schema app grant all on tables to anon, authenticated, service_role;
alter default privileges in schema app grant all on sequences to anon, authenticated, service_role;

alter default privileges in schema trading grant all on tables to anon, authenticated, service_role;
alter default privileges in schema trading grant all on sequences to anon, authenticated, service_role;
