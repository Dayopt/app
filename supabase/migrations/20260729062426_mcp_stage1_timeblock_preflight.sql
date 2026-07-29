-- Stop before changing OAuth or timeblock behavior when existing Production
-- rows cannot be represented by the Stage 1 compatibility contract.
--
-- This migration intentionally repairs nothing. An operator must inspect any
-- rejected rows and choose the domain-correct forward fix before retrying.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oauth_authorization_codes)
    OR EXISTS (SELECT 1 FROM public.oauth_tokens) THEN
    RAISE EXCEPTION
      'Legacy OAuth rows must be drained before MCP Stage 1'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.records AS record
    JOIN public.plans AS plan
      ON plan.id = record.plan_id
      AND plan.user_id = record.user_id
    WHERE record.deleted_at IS NULL
      AND plan.skipped_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION
      'Active Records linked to skipped Plans require operator review'
      USING ERRCODE = '23514';
  END IF;
END;
$$;
