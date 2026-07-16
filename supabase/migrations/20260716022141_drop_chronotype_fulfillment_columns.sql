BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

LOCK TABLE public.records, public.user_settings IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  fulfillment_score_count BIGINT;
  chronotype_settings_count BIGINT;
BEGIN
  SELECT count(*)
  INTO fulfillment_score_count
  FROM public.records
  WHERE fulfillment_score IS NOT NULL;

  SELECT count(*)
  INTO chronotype_settings_count
  FROM public.user_settings
  WHERE chronotype_settings IS NOT NULL;

  RAISE NOTICE 'approved column cleanup counts: fulfillment_score=%, chronotype_settings=%',
    fulfillment_score_count,
    chronotype_settings_count;

  IF fulfillment_score_count > 1 THEN
    RAISE EXCEPTION
      'fulfillment_score non-null count % exceeds approved maximum 1',
      fulfillment_score_count;
  END IF;

  IF chronotype_settings_count > 2 THEN
    RAISE EXCEPTION
      'chronotype_settings non-null count % exceeds approved maximum 2',
      chronotype_settings_count;
  END IF;
END;
$$;

ALTER TABLE public.records DROP COLUMN fulfillment_score;
ALTER TABLE public.user_settings DROP COLUMN chronotype_settings;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.records'::regclass
      AND attname = 'fulfillment_score'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'public.records.fulfillment_score still exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'public.user_settings'::regclass
      AND attname = 'chronotype_settings'
      AND attnum > 0
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'public.user_settings.chronotype_settings still exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.records'::regclass
      AND conname = 'records_fulfillment_score_check'
  ) THEN
    RAISE EXCEPTION 'records_fulfillment_score_check still exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_index index_metadata
      ON index_metadata.indexrelid = index_relation.oid
    WHERE index_metadata.indrelid = 'public.records'::regclass
      AND index_relation.relname = 'records_fulfillment_score_idx'
  ) THEN
    RAISE EXCEPTION 'records_fulfillment_score_idx still exists';
  END IF;
END;
$$;

COMMIT;
