-- external-calendar-import Step 1 (issue #1703).
-- Connection model for one-way external calendar import: account connections and
-- the calendars selected under them. No OAuth, sync, or UI lands here.
--
-- Design: docs/projects/external-calendar-import/overview.md §4.
-- Format follows 20260708232500_add_time_model_tables.sql.
--
-- Token protection (§4-3): `refresh_token_enc` holds AES-256-GCM ciphertext AND is
-- withheld from `authenticated` by a column-scoped SELECT grant. This is the first
-- column-scoped SELECT in this repo -- the two precedents cited by §4-3
-- (GRANT UPDATE(dismissed_at), 20260705070000) are both write-side grants.
--
-- Why the grants are verified inside this migration (section 6): production and
-- local disagree on `pg_default_acl` for new public tables. Production grants
-- anon/authenticated `arwdDxtm` (full DML); a clean local/Preview database grants
-- only `Dxtm`. A missing REVOKE would therefore expose `refresh_token_enc` in
-- production while looking clean locally, and `pnpm rls:snapshot` cannot catch it
-- (it reports only SELECT/INSERT/UPDATE/DELETE, so TRUNCATE is invisible too).
-- The invariant block below is the only gate that runs where it matters.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  provider_account_email TEXT,
  granted_scopes TEXT[] NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  status TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Free text + not-blank, matching the mirror table (§4-1 "enum 不使用").
  CONSTRAINT calendar_connections_provider_not_blank CHECK (length(btrim(provider)) > 0),
  CONSTRAINT calendar_connections_provider_account_id_not_blank
    CHECK (length(btrim(provider_account_id)) > 0),
  CONSTRAINT calendar_connections_refresh_token_enc_not_blank
    CHECK (length(btrim(refresh_token_enc)) > 0),
  -- `status` is app-controlled (unlike the provider-supplied mirror status), so the
  -- closed value set is enforced like plans_source_check. This subsumes not-blank.
  CONSTRAINT calendar_connections_status_check CHECK (status IN ('active', 'reauth_required')),
  -- NOT NULL alone admits '{}' and '{NULL}', which defeats the audit / scope-drift
  -- purpose the column exists for (§4-1).
  CONSTRAINT calendar_connections_granted_scopes_not_empty CHECK (
    cardinality(granted_scopes) > 0 AND array_position(granted_scopes, NULL::TEXT) IS NULL
  ),
  -- Referenced by the child's composite FK below.
  CONSTRAINT calendar_connections_id_user_id_unique UNIQUE (id, user_id)
);

-- Only selected calendars are persisted. The selectable list is fetched on demand
-- from the provider and never stored (§4-2).
CREATE TABLE public.calendar_connection_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_calendar_id TEXT NOT NULL,
  calendar_name TEXT,
  -- Per-calendar sync cursor (Google syncToken / Graph deltaLink). NULL = full sync
  -- next run. A cursor is not a credential, so it stays inside the table-level
  -- SELECT grant the design assigns to this table (§4-4).
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_connection_calendars_provider_calendar_id_not_blank
    CHECK (length(btrim(provider_calendar_id)) > 0),
  -- Owner integrity as a composite FK rather than a constraint trigger. A child-side
  -- AFTER INSERT OR UPDATE trigger cannot see `UPDATE calendar_connections SET user_id`
  -- (the gap 20260706120100_backfill_entry_tag_owner_mismatch.sql had to backfill), and
  -- its unlocked existence probe is racy. RI takes FOR KEY SHARE on the referenced row.
  CONSTRAINT calendar_connection_calendars_connection_owner_fkey
    FOREIGN KEY (connection_id, user_id)
    REFERENCES public.calendar_connections (id, user_id)
    ON DELETE CASCADE
);

-- The mirror was created in Phase 1 as an FK receptacle only, without a link to the
-- connection that produced each row. §4-1 allows several accounts of the same provider,
-- so two connections subscribed to the same shared calendar would collide on the
-- upsert key and disconnect could not scope its prune. Both environments are still
-- empty, so this costs no backfill.
--
-- ON DELETE SET NULL, not CASCADE: §8 keeps mirror rows that plans / records already
-- reference. Those FKs are NO ACTION, so a cascading delete would raise 23503 and abort
-- the whole disconnect. Orphaned rows stay as the historical anchor §8 describes.
ALTER TABLE public.external_calendar_events
  ADD COLUMN connection_id UUID REFERENCES public.calendar_connections(id) ON DELETE SET NULL;

-- =============================================================================
-- 2. Constraints / indexes
-- =============================================================================

-- Several accounts of the same provider are allowed from the start (§4-1).
CREATE UNIQUE INDEX calendar_connections_provider_account_unique
  ON public.calendar_connections(user_id, provider, provider_account_id);

-- Declared as an index rather than an inline UNIQUE: the auto-generated constraint name
-- would be 68 characters and Postgres would silently truncate it to 63.
CREATE UNIQUE INDEX calendar_connection_calendars_provider_calendar_unique
  ON public.calendar_connection_calendars(connection_id, provider_calendar_id);

-- The unique index above starts at connection_id, so it does not serve user_id lookups
-- or the auth.users cascade. calendar_connections needs no equivalent: its
-- (user_id, provider, provider_account_id) index already supplies the user_id prefix.
CREATE INDEX calendar_connection_calendars_user_id_idx
  ON public.calendar_connection_calendars(user_id);

-- Rebuild the mirror's upsert key to include connection_id. NULLS DISTINCT (the default)
-- is intentional: rows orphaned by disconnect carry connection_id IS NULL and never
-- participate in an upsert again, so treating them as distinct can never block a
-- disconnect, while live rows always carry a connection_id and dedupe normally.
DROP INDEX public.external_calendar_events_provider_event_unique;

CREATE UNIQUE INDEX external_calendar_events_provider_event_unique
  ON public.external_calendar_events(
    user_id, provider, connection_id, provider_calendar_id, provider_event_id
  );

CREATE INDEX external_calendar_events_connection_id_idx
  ON public.external_calendar_events(connection_id)
  WHERE connection_id IS NOT NULL;

-- =============================================================================
-- 3. Triggers
-- =============================================================================

-- public.update_updated_at() already exists; only the triggers are new.
CREATE TRIGGER trigger_update_calendar_connections_updated_at
  BEFORE UPDATE ON public.calendar_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_calendar_connection_calendars_updated_at
  BEFORE UPDATE ON public.calendar_connection_calendars
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 4. RLS / GRANT
-- =============================================================================
--
-- Order matters. Revoking a table-level privilege also drops the column privileges on
-- every column, so REVOKE must precede the column-scoped GRANT.

ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_connection_calendars ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.calendar_connection_calendars FROM PUBLIC, anon, authenticated;

-- Column-scoped: refresh_token_enc / granted_scopes / provider_account_id are never
-- readable by a browser client. user_id and updated_at are granted on purpose --
-- user_id is already in the caller's JWT so it discloses nothing, and withholding it
-- would make `.eq('user_id', ...)` and `ORDER BY updated_at` fail with 42501, which is
-- the dominant query idiom in this codebase.
--
-- Any query touching a non-granted column fails with 42501 -- including select('*'),
-- WHERE, ORDER BY, and EXPLAIN. The error names the table, never the column, so the
-- service layer must list columns explicitly.
GRANT SELECT (
  id,
  user_id,
  provider,
  provider_account_email,
  status,
  last_synced_at,
  last_sync_error,
  created_at,
  updated_at
) ON public.calendar_connections TO authenticated;

GRANT SELECT ON public.calendar_connection_calendars TO authenticated;

-- All mutations run through the tRPC service with createServiceRoleClient and an
-- explicit user_id guard, matching the mirror table.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_connection_calendars TO service_role;

CREATE POLICY "Users can view own calendar connections"
  ON public.calendar_connections
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role has full access to calendar connections"
  ON public.calendar_connections
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own calendar connection calendars"
  ON public.calendar_connection_calendars
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Service role has full access to calendar connection calendars"
  ON public.calendar_connection_calendars
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- =============================================================================
-- 5. Schema invariants
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.external_calendar_events'::regclass
      AND attname = 'connection_id'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'public.external_calendar_events.connection_id was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_metadata
    JOIN pg_class index_relation ON index_relation.oid = index_metadata.indexrelid
    WHERE index_metadata.indrelid = 'public.external_calendar_events'::regclass
      AND index_relation.relname = 'external_calendar_events_provider_event_unique'
      AND index_metadata.indisunique
      AND index_metadata.indnkeyatts = 5
  ) THEN
    RAISE EXCEPTION 'external_calendar_events_provider_event_unique is not the 5-column key';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.calendar_connection_calendars'::regclass
      AND conname = 'calendar_connection_calendars_connection_owner_fkey'
      AND contype = 'f'
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'the composite owner FK on calendar_connection_calendars is missing';
  END IF;
END;
$$;

-- =============================================================================
-- 6. Privilege invariants
-- =============================================================================
--
-- These run on every environment the migration is applied to, which is the point:
-- production seeds new public tables with anon/authenticated = arwdDxtm, local with
-- Dxtm. Only an in-migration assertion catches a REVOKE that failed to do its job
-- where it actually matters. TRUNCATE is asserted explicitly because RLS does not
-- restrict it and pnpm rls:snapshot does not report it.

DO $$
DECLARE
  connection_tables TEXT[] := ARRAY[
    'public.calendar_connections',
    'public.calendar_connection_calendars'
  ];
  hidden_columns TEXT[] := ARRAY['refresh_token_enc', 'granted_scopes', 'provider_account_id'];
  visible_columns TEXT[] := ARRAY[
    'id',
    'user_id',
    'provider',
    'provider_account_email',
    'status',
    'last_synced_at',
    'last_sync_error',
    'created_at',
    'updated_at'
  ];
  target_table TEXT;
  target_column TEXT;
  browser_role TEXT;
BEGIN
  FOREACH target_table IN ARRAY connection_tables LOOP
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(browser_role, target_table, 'INSERT')
        OR has_table_privilege(browser_role, target_table, 'UPDATE')
        OR has_table_privilege(browser_role, target_table, 'DELETE')
        OR has_table_privilege(browser_role, target_table, 'TRUNCATE')
      THEN
        RAISE EXCEPTION '% must not hold write privileges on %', browser_role, target_table;
      END IF;
    END LOOP;

    IF has_table_privilege('anon', target_table, 'SELECT') THEN
      RAISE EXCEPTION 'anon must not hold SELECT on %', target_table;
    END IF;

    IF NOT has_table_privilege('service_role', target_table, 'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION 'service_role is missing DML privileges on %', target_table;
    END IF;
  END LOOP;

  -- calendar_connections is column-scoped: no table-level SELECT at all.
  IF has_table_privilege('authenticated', 'public.calendar_connections', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not hold table-level SELECT on calendar_connections';
  END IF;

  FOREACH target_column IN ARRAY hidden_columns LOOP
    IF has_column_privilege(
      'authenticated', 'public.calendar_connections', target_column, 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated must not read calendar_connections.%', target_column;
    END IF;
  END LOOP;

  FOREACH target_column IN ARRAY visible_columns LOOP
    IF NOT has_column_privilege(
      'authenticated', 'public.calendar_connections', target_column, 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated is missing SELECT on calendar_connections.%', target_column;
    END IF;
  END LOOP;

  -- The child keeps table-level SELECT (§4-4).
  IF NOT has_table_privilege('authenticated', 'public.calendar_connection_calendars', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated is missing SELECT on calendar_connection_calendars';
  END IF;
END;
$$;

COMMIT;
