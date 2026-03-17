-- IP単位レート制限用インデックスを追加
-- @see src/features/auth/lib/ip-rate-limit.ts

-- IPアドレス単位でのクエリを高速化
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address
ON public.login_attempts(ip_address);

-- IP + 時間での複合インデックス
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
ON public.login_attempts(ip_address, attempt_time);

COMMENT ON INDEX public.idx_login_attempts_ip_address IS 'IP単位レート制限用インデックス';
COMMENT ON INDEX public.idx_login_attempts_ip_time IS 'IP単位レート制限用複合インデックス';
