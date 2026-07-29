-- Candidate 1 introduces only the opaque account-preserving generation and
-- receipt tombstone lifecycle needed to reject stale replay. The purge command,
-- Calendar writers, outbox, and Stage 3 enforcement remain deferred.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE private.user_data_controls (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  generation BIGINT NOT NULL DEFAULT 0 CHECK (generation >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

REVOKE ALL ON TABLE private.user_data_controls
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO private.user_data_controls (user_id, generation)
SELECT app_user.id, 0
FROM auth.users AS app_user
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE private.user_data_controls IS
  'Private account-preserving purge generation. External writers must bind and revalidate this value.';

CREATE FUNCTION private.get_user_data_generation_v1(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation BIGINT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required'
      USING ERRCODE = '22004';
  END IF;

  INSERT INTO private.user_data_controls (user_id, generation)
  SELECT app_user.id, 0
  FROM auth.users AS app_user
  WHERE app_user.id = p_user_id
  ON CONFLICT (user_id) DO NOTHING;

  SELECT control.generation
  INTO v_generation
  FROM private.user_data_controls AS control
  WHERE control.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User data generation is unavailable'
      USING ERRCODE = 'DG001';
  END IF;

  RETURN v_generation;
END;
$$;

REVOKE ALL ON FUNCTION private.get_user_data_generation_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_user_data_generation_v1(p_user_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.get_user_data_generation_v1(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_data_generation_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_data_generation_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.get_user_data_generation_v1(UUID) IS
  'Returns the opaque account-preserving purge generation for one user; service role only.';


ALTER TABLE public.mcp_mutation_receipts
  ADD COLUMN data_generation BIGINT NOT NULL DEFAULT 0
    CHECK (data_generation >= 0),
  ADD COLUMN purged_generation BIGINT,
  ADD COLUMN purged_at TIMESTAMPTZ,
  ADD CONSTRAINT mcp_mutation_receipts_purge_shape CHECK (
    (purged_generation IS NULL AND purged_at IS NULL)
    OR (
      purged_generation IS NOT NULL
      AND purged_at IS NOT NULL
      AND purged_generation > data_generation
      AND resource_deleted_at IS NOT NULL
    )
  );

COMMENT ON COLUMN public.mcp_mutation_receipts.data_generation IS
  'DB-authored user data generation in which the mutation completed.';
COMMENT ON COLUMN public.mcp_mutation_receipts.purged_generation IS
  'First account-preserving purge generation that invalidated this successful receipt.';

CREATE OR REPLACE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_generation BIGINT;
  v_origin_detach_allowed BOOLEAN;
  v_purge_mark_allowed BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_generation := private.get_user_data_generation_v1(NEW.user_id);
    NEW.data_generation := v_generation;
    NEW.purged_generation := NULL;
    NEW.purged_at := NULL;
    NEW.applied_at := pg_catalog.clock_timestamp();
    RETURN NEW;
  END IF;

  v_origin_detach_allowed := (
    NEW.origin_connection_id IS NOT DISTINCT FROM OLD.origin_connection_id
    OR (
      OLD.origin_connection_id IS NOT NULL
      AND NEW.origin_connection_id IS NULL
    )
  );

  v_purge_mark_allowed := (
    (
      NEW.purged_generation IS NOT DISTINCT FROM OLD.purged_generation
      AND NEW.purged_at IS NOT DISTINCT FROM OLD.purged_at
      AND NEW.resource_deleted_at IS NOT DISTINCT FROM OLD.resource_deleted_at
    )
    OR (
      OLD.purged_generation IS NULL
      AND OLD.purged_at IS NULL
      AND NEW.purged_generation IS NOT NULL
      AND NEW.purged_at IS NOT NULL
      AND NEW.purged_generation > OLD.data_generation
      AND NEW.resource_deleted_at IS NOT NULL
      AND (
        OLD.resource_deleted_at IS NULL
        OR NEW.resource_deleted_at IS NOT DISTINCT FROM OLD.resource_deleted_at
      )
    )
  );

  IF v_origin_detach_allowed
    AND v_purge_mark_allowed
    AND ROW(
      NEW.user_id,
      NEW.client_id,
      NEW.operation_id,
      NEW.envelope_version,
      NEW.tool_name,
      NEW.request_digest,
      NEW.resource_type,
      NEW.resource_id,
      NEW.resource_version,
      NEW.applied_at,
      NEW.data_generation
    ) IS NOT DISTINCT FROM ROW(
      OLD.user_id,
      OLD.client_id,
      OLD.operation_id,
      OLD.envelope_version,
      OLD.tool_name,
      OLD.request_digest,
      OLD.resource_type,
      OLD.resource_id,
      OLD.resource_version,
      OLD.applied_at,
      OLD.data_generation
    ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'MCP mutation receipts are immutable'
    USING ERRCODE = '23514';
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.resolve_mcp_mutation_replay_v1(
  p_user_id UUID,
  p_client_id TEXT,
  p_operation_id UUID,
  p_tool_name TEXT,
  p_request_digest BYTEA,
  p_envelope_version SMALLINT,
  p_resource_type TEXT
)
RETURNS SETOF public.mcp_mutation_receipts
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_generation BIGINT;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
BEGIN
  SELECT receipt.*
  INTO v_receipt
  FROM public.mcp_mutation_receipts AS receipt
  WHERE receipt.user_id = p_user_id
    AND receipt.client_id = p_client_id
    AND receipt.operation_id = p_operation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_receipt.applied_at < v_cutoff THEN
    DELETE FROM public.mcp_mutation_receipts AS receipt
    WHERE receipt.user_id = p_user_id
      AND receipt.client_id = p_client_id
      AND receipt.operation_id = p_operation_id;
    RETURN;
  END IF;

  IF v_receipt.tool_name IS DISTINCT FROM p_tool_name
    OR v_receipt.request_digest IS DISTINCT FROM p_request_digest THEN
    RAISE EXCEPTION 'MCP operation ID was reused for a different request'
      USING ERRCODE = 'DM006';
  END IF;

  IF v_receipt.envelope_version IS DISTINCT FROM p_envelope_version
    OR v_receipt.resource_type IS DISTINCT FROM p_resource_type THEN
    RAISE EXCEPTION 'MCP mutation receipt invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  v_generation := private.get_user_data_generation_v1(p_user_id);

  IF v_receipt.purged_generation IS NOT NULL
    OR v_receipt.data_generation < v_generation THEN
    RAISE EXCEPTION 'MCP mutation result was removed by user data deletion'
      USING ERRCODE = 'DM008';
  END IF;

  RETURN NEXT v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION private.resolve_mcp_mutation_replay_v1(
  UUID, TEXT, UUID, TEXT, BYTEA, SMALLINT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;


COMMIT;
