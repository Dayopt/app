-- GeoIP情報を監査ログに追加
-- @see src/lib/security/geolocation.ts
--
-- 目的:
-- - 不審なアクセスの地理的検出
-- - 普段と異なる場所からのログイン検知

-- Add geo columns to audit_logs
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS geo_country TEXT,
ADD COLUMN IF NOT EXISTS geo_country_name TEXT,
ADD COLUMN IF NOT EXISTS geo_region TEXT,
ADD COLUMN IF NOT EXISTS geo_city TEXT,
ADD COLUMN IF NOT EXISTS geo_timezone TEXT,
ADD COLUMN IF NOT EXISTS geo_source TEXT;

-- Add comments
COMMENT ON COLUMN public.audit_logs.geo_country IS '国コード（ISO 3166-1 alpha-2）';
COMMENT ON COLUMN public.audit_logs.geo_country_name IS '国名';
COMMENT ON COLUMN public.audit_logs.geo_region IS '地域/州';
COMMENT ON COLUMN public.audit_logs.geo_city IS '都市';
COMMENT ON COLUMN public.audit_logs.geo_timezone IS 'タイムゾーン';
COMMENT ON COLUMN public.audit_logs.geo_source IS '情報ソース（vercel/api/unknown）';

-- Create index for geo-based queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_geo_country
ON public.audit_logs(geo_country)
WHERE geo_country IS NOT NULL;
