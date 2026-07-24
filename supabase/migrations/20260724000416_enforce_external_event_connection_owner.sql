-- Follow-up to 20260723233814 (external-calendar-import Step 1, issue #1703).
--
-- That migration linked the mirror to a connection with a single-column FK:
--   connection_id UUID REFERENCES calendar_connections(id) ON DELETE SET NULL
-- which proves only that the connection exists, not that it belongs to the row's
-- own user. A service_role writer (the Step 3 sync engine, the Step 7 disconnect
-- path) could therefore attach user A's mirror row to user B's connection. Three
-- consequences, none of them theoretical once Step 3 lands:
--
--   1. connection-scoped prune / disconnect would mutate the wrong user's rows
--   2. `ON DELETE SET NULL` would silently blank a foreign user's connection_id
--      when the owner of that connection disconnects
--   3. external_calendar_events grants table-level SELECT to authenticated, so the
--      row owner could read a connection UUID belonging to someone else
--
-- calendar_connection_calendars already enforces owner integrity with the composite
-- FK pattern. The mirror link needs the same rule. Found in review of PR #1714.
--
-- ON DELETE SET NULL (connection_id) — the column list is required here (PG15+, both
-- local and production run 17.6): a bare SET NULL would null every referencing column
-- including user_id, which is NOT NULL, so disconnect would fail with 23502.
--
-- MATCH SIMPLE (the default) is what keeps orphaned rows legal: once connection_id is
-- NULL the constraint is not checked at all, so the rows §8 keeps as historical
-- anchors stay valid.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.external_calendar_events
  DROP CONSTRAINT external_calendar_events_connection_id_fkey;

ALTER TABLE public.external_calendar_events
  ADD CONSTRAINT external_calendar_events_connection_owner_fkey
  FOREIGN KEY (connection_id, user_id)
  REFERENCES public.calendar_connections (id, user_id)
  ON DELETE SET NULL (connection_id);

DO $$
DECLARE
  delete_action "char";
  null_columns SMALLINT[];
  referenced_columns SMALLINT[];
  connection_id_attnum SMALLINT;
BEGIN
  SELECT confdeltype, confdelsetcols, conkey
  INTO delete_action, null_columns, referenced_columns
  FROM pg_constraint
  WHERE conrelid = 'public.external_calendar_events'::regclass
    AND conname = 'external_calendar_events_connection_owner_fkey'
    AND contype = 'f';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'external_calendar_events_connection_owner_fkey was not created';
  END IF;

  IF array_length(referenced_columns, 1) <> 2 THEN
    RAISE EXCEPTION 'the mirror connection FK must cover (connection_id, user_id)';
  END IF;

  IF delete_action <> 'n' THEN
    RAISE EXCEPTION 'the mirror connection FK must use ON DELETE SET NULL, found %', delete_action;
  END IF;

  SELECT attnum
  INTO connection_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.external_calendar_events'::regclass
    AND attname = 'connection_id'
    AND NOT attisdropped;

  -- Only connection_id may be nulled. Nulling user_id would violate its NOT NULL.
  IF null_columns IS DISTINCT FROM ARRAY[connection_id_attnum]::SMALLINT[] THEN
    RAISE EXCEPTION 'ON DELETE SET NULL must name connection_id only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.external_calendar_events'::regclass
      AND conname = 'external_calendar_events_connection_id_fkey'
  ) THEN
    RAISE EXCEPTION 'the single-column connection FK still exists';
  END IF;
END;
$$;

COMMIT;
