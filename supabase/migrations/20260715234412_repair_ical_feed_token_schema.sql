BEGIN;

SET LOCAL lock_timeout = '5s';

-- 20260317100000 is recorded as applied in production, but the column and
-- index are absent. Reconcile the physical schema without rewriting history.
-- Adding the nullable column without its volatile default keeps this
-- AccessExclusive lock to a metadata-only operation.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ical_feed_token UUID;

ALTER TABLE public.user_settings
  ALTER COLUMN ical_feed_token SET DEFAULT gen_random_uuid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    LEFT JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
      AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = 'public.user_settings'::regclass
      AND attribute.attname = 'ical_feed_token'
      AND NOT attribute.attisdropped
      AND pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) = 'uuid'
      AND NOT attribute.attnotnull
      AND pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid) = 'gen_random_uuid()'
  ) THEN
    RAISE EXCEPTION 'public.user_settings.ical_feed_token does not match the canonical schema';
  END IF;
END;
$$;

COMMIT;

-- Backfill after releasing the AccessExclusive lock. Existing settings rows
-- receive the same token initialization as the original migration.
BEGIN;

SET LOCAL lock_timeout = '5s';

UPDATE public.user_settings
SET ical_feed_token = gen_random_uuid()
WHERE ical_feed_token IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_settings
    WHERE ical_feed_token IS NULL
  ) THEN
    RAISE EXCEPTION 'public.user_settings.ical_feed_token backfill is incomplete';
  END IF;
END;
$$;

COMMIT;

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_settings_ical_feed_token
  ON public.user_settings (ical_feed_token)
  WHERE ical_feed_token IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_index AS index_metadata
    JOIN pg_catalog.pg_class AS index_relation
      ON index_relation.oid = index_metadata.indexrelid
    JOIN pg_catalog.pg_class AS table_relation
      ON table_relation.oid = index_metadata.indrelid
    JOIN pg_catalog.pg_namespace AS table_namespace
      ON table_namespace.oid = table_relation.relnamespace
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = table_relation.oid
      AND attribute.attnum = ANY(index_metadata.indkey)
    WHERE table_namespace.nspname = 'public'
      AND table_relation.relname = 'user_settings'
      AND index_relation.relname = 'idx_user_settings_ical_feed_token'
      AND index_metadata.indisunique
      AND index_metadata.indnkeyatts = 1
      AND attribute.attname = 'ical_feed_token'
      AND pg_catalog.pg_get_expr(index_metadata.indpred, index_metadata.indrelid)
        = '(ical_feed_token IS NOT NULL)'
  ) THEN
    RAISE EXCEPTION 'idx_user_settings_ical_feed_token does not match the canonical schema';
  END IF;
END;
$$;

COMMIT;
