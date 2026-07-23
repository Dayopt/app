-- The following migration adds unconditional CHECK constraints. Revocation
-- alone cannot make a write-only row satisfy them, so stop with an actionable
-- message before any locking constraint scan begins.

DO $$
DECLARE
  v_write_scopes CONSTANT TEXT[] := ARRAY[
    'write:plans',
    'delete:plans',
    'write:records',
    'delete:records'
  ]::TEXT[];
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.oauth_connections
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) OR EXISTS (
    SELECT 1
    FROM public.oauth_authorization_codes
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) OR EXISTS (
    SELECT 1
    FROM public.oauth_tokens
    WHERE scopes && v_write_scopes
      AND NOT ('read:entries' = ANY (scopes))
  ) THEN
    RAISE EXCEPTION
      'OAuth write-only rows must be removed or repaired under an explicit consent-safe remediation before adding the base-read constraint; revocation alone is insufficient'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
