-- The durable client gate starts with every client disabled. Irreversibly
-- disable pre-gate write connections before any client is enabled so a later
-- enable cannot resurrect an authorization issued under the old contract.
-- Production applies this immediately after 20260723131100 while the global
-- mutation gate remains OFF.

UPDATE public.oauth_connections AS connection
SET write_disabled_at = COALESCE(connection.write_disabled_at, pg_catalog.now())
WHERE connection.write_enabled_at IS NOT NULL
  AND connection.write_disabled_at IS NULL;
