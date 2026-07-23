-- MCP mutation safety substrate. No write tool is exposed by this migration:
-- the global control starts OFF and completed receipts can only be written by
-- later typed SECURITY DEFINER apply functions.

-- =============================================================================
-- 1. Private helpers are not part of the Data API surface
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 2. Irreversible per-connection write disable
-- =============================================================================

ALTER TABLE public.oauth_connections
  ADD COLUMN write_disabled_at TIMESTAMPTZ,
  ADD CONSTRAINT oauth_connections_write_disable_shape CHECK (
    write_disabled_at IS NULL
    OR (
      write_enabled_at IS NOT NULL
      AND write_disabled_at >= write_enabled_at
    )
  );

COMMENT ON COLUMN public.oauth_connections.write_disabled_at IS
  'Irreversible DB-authored MCP write kill switch. Re-enable by creating a new OAuth connection.';

CREATE FUNCTION private.enforce_oauth_connection_write_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.write_enabled_at IS DISTINCT FROM OLD.write_enabled_at THEN
    RAISE EXCEPTION 'OAuth write grant marker is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.write_disabled_at IS NULL AND NEW.write_disabled_at IS NOT NULL THEN
    NEW.write_disabled_at := pg_catalog.now();
  ELSIF NEW.write_disabled_at IS DISTINCT FROM OLD.write_disabled_at THEN
    RAISE EXCEPTION 'OAuth write disable timestamp is immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_oauth_connection_write_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_enforce_oauth_connection_write_lifecycle
  BEFORE UPDATE OF write_enabled_at, write_disabled_at
  ON public.oauth_connections
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_oauth_connection_write_lifecycle_v1();

-- OAuth grant/rotation/revoke paths already use owner-executed typed RPCs.
-- Keep only the direct usage timestamp update required by the current server.
REVOKE ALL ON TABLE public.oauth_connections FROM service_role;
GRANT SELECT ON TABLE public.oauth_connections TO service_role;
GRANT UPDATE (last_used_at) ON TABLE public.oauth_connections TO service_role;

CREATE FUNCTION public.disable_oauth_connection_writes_v1(p_connection_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_disabled_at TIMESTAMPTZ;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'Connection ID is required'
      USING ERRCODE = '22004';
  END IF;

  SELECT connection.write_disabled_at
  INTO v_disabled_at
  FROM public.oauth_connections AS connection
  WHERE connection.id = p_connection_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OAuth connection not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_disabled_at IS NULL THEN
    UPDATE public.oauth_connections
    SET write_disabled_at = pg_catalog.now()
    WHERE id = p_connection_id
    RETURNING write_disabled_at INTO v_disabled_at;
  END IF;

  RETURN v_disabled_at;
END;
$$;

REVOKE ALL ON FUNCTION public.disable_oauth_connection_writes_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disable_oauth_connection_writes_v1(UUID)
  TO service_role;

COMMENT ON FUNCTION public.disable_oauth_connection_writes_v1(UUID) IS
  'Irreversibly disables MCP writes for one OAuth connection. Callable only by service_role.';

-- =============================================================================
-- 3. Revisioned global write control, initially fail-closed
-- =============================================================================

CREATE TABLE public.mcp_mutation_control (
  singleton_key BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton_key),
  writes_enabled BOOLEAN NOT NULL DEFAULT false,
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

INSERT INTO public.mcp_mutation_control (singleton_key, writes_enabled, revision)
VALUES (true, false, 0);

COMMENT ON TABLE public.mcp_mutation_control IS
  'Singleton durable MCP mutation gate. Apply functions fail closed unless this row exists and writes are enabled.';

ALTER TABLE public.mcp_mutation_control ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mcp_mutation_control
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.mcp_mutation_control TO service_role;

CREATE FUNCTION public.set_mcp_mutation_control_v1(
  p_writes_enabled BOOLEAN,
  p_expected_revision BIGINT
)
RETURNS TABLE(
  writes_enabled BOOLEAN,
  revision BIGINT,
  changed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_writes_enabled IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Invalid MCP mutation control input'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.mcp_mutation_control AS control
  SET writes_enabled = p_writes_enabled,
      revision = control.revision + 1,
      changed_at = pg_catalog.now()
  WHERE control.singleton_key = true
    AND control.revision = p_expected_revision
  RETURNING control.writes_enabled, control.revision, control.changed_at;

  IF NOT FOUND THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.mcp_mutation_control AS control
      WHERE control.singleton_key = true
    ) THEN
      RAISE EXCEPTION 'MCP mutation control is missing'
        USING ERRCODE = 'DM002';
    END IF;

    RAISE EXCEPTION 'MCP mutation control revision is stale'
      USING ERRCODE = 'DM001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_mcp_mutation_control_v1(BOOLEAN, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_mcp_mutation_control_v1(BOOLEAN, BIGINT)
  TO service_role;

COMMENT ON FUNCTION public.set_mcp_mutation_control_v1(BOOLEAN, BIGINT) IS
  'CAS update for the singleton MCP mutation gate. Callable only by service_role.';

-- =============================================================================
-- 4. Completed mutation receipts and receipt-key serialization
-- =============================================================================

CREATE TABLE public.mcp_mutation_receipts (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL CHECK (client_id IN ('claude-ai', 'chatgpt', 'cursor')),
  operation_id UUID NOT NULL,
  origin_connection_id UUID REFERENCES public.oauth_connections(id) ON DELETE SET NULL,
  envelope_version SMALLINT NOT NULL CHECK (envelope_version > 0),
  tool_name TEXT NOT NULL CHECK (
    char_length(tool_name) BETWEEN 1 AND 128
    AND tool_name ~ '^[a-z][a-z0-9.]*$'
  ),
  request_digest BYTEA NOT NULL CHECK (octet_length(request_digest) = 32),
  resource_type TEXT NOT NULL CHECK (resource_type IN ('plan', 'record')),
  resource_id UUID NOT NULL,
  resource_version TIMESTAMPTZ NOT NULL,
  resource_deleted_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (user_id, client_id, operation_id)
);

COMMENT ON TABLE public.mcp_mutation_receipts IS
  'Payload-free authoritative audit and 90-day idempotency receipt for successful MCP mutations.';
COMMENT ON COLUMN public.mcp_mutation_receipts.request_digest IS
  'DB-authored 32-byte SHA-256 digest of the canonical typed mutation envelope.';

CREATE INDEX mcp_mutation_receipts_origin_connection_idx
  ON public.mcp_mutation_receipts (origin_connection_id)
  WHERE origin_connection_id IS NOT NULL;
CREATE INDEX mcp_mutation_receipts_applied_at_idx
  ON public.mcp_mutation_receipts (applied_at);

ALTER TABLE public.mcp_mutation_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mcp_mutation_receipts
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.mcp_mutation_receipts TO service_role;

CREATE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'MCP mutation receipts are immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW.applied_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trigger_enforce_mcp_mutation_receipt_lifecycle
  BEFORE INSERT OR UPDATE ON public.mcp_mutation_receipts
  FOR EACH ROW
  EXECUTE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1();

CREATE FUNCTION private.lock_mcp_mutation_operation_v1(
  p_user_id UUID,
  p_client_id TEXT,
  p_operation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL OR p_client_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'MCP mutation receipt key is incomplete'
      USING ERRCODE = '22004';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::TEXT || ':' || p_client_id || ':' || p_operation_id::TEXT,
      7428331085192745
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION private.lock_mcp_mutation_operation_v1(UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.cleanup_mcp_mutation_receipts_v1(p_limit INTEGER DEFAULT 1000)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ := pg_catalog.now() - INTERVAL '90 days';
  v_receipt RECORD;
  v_deleted INTEGER;
  v_total INTEGER := 0;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Receipt cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  FOR v_receipt IN
    SELECT receipt.user_id, receipt.client_id, receipt.operation_id
    FROM public.mcp_mutation_receipts AS receipt
    WHERE receipt.applied_at < v_cutoff
    ORDER BY receipt.applied_at, receipt.user_id, receipt.client_id, receipt.operation_id
    LIMIT p_limit
  LOOP
    PERFORM private.lock_mcp_mutation_operation_v1(
      v_receipt.user_id,
      v_receipt.client_id,
      v_receipt.operation_id
    );

    DELETE FROM public.mcp_mutation_receipts AS receipt
    WHERE receipt.user_id = v_receipt.user_id
      AND receipt.client_id = v_receipt.client_id
      AND receipt.operation_id = v_receipt.operation_id
      AND receipt.applied_at < v_cutoff;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_mcp_mutation_receipts_v1(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_mcp_mutation_receipts_v1(INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_mcp_mutation_receipts_v1(INTEGER) IS
  'Deletes only receipts older than the public 90-day idempotency window. Callable only by service_role.';
