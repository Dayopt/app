-- Keep mutation receipts immutable while allowing the FK-owned
-- origin_connection_id detach caused by ON DELETE SET NULL.

CREATE OR REPLACE FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.origin_connection_id IS NOT NULL
      AND NEW.origin_connection_id IS NULL
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
        NEW.resource_deleted_at,
        NEW.applied_at
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
        OLD.resource_deleted_at,
        OLD.applied_at
      ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'MCP mutation receipts are immutable'
      USING ERRCODE = '23514';
  END IF;

  NEW.applied_at := pg_catalog.now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_mcp_mutation_receipt_lifecycle_v1()
  FROM PUBLIC, anon, authenticated, service_role;
