-- audit_logs テーブルの削除（auth_audit_logs に統合）
-- 理由: TypeScriptコードからの呼び出しゼロ。参照先の src/lib/audit/logger.ts は未実装。
-- auth_audit_logs が実際に使用されているため、geo列を移植してから削除。

-- auth_audit_logs に geo 列を追加（audit_logs から移植）
ALTER TABLE public.auth_audit_logs
  ADD COLUMN IF NOT EXISTS geo_country TEXT,
  ADD COLUMN IF NOT EXISTS geo_city TEXT;

-- audit_logs の cleanup 関数を削除
DROP FUNCTION IF EXISTS public.cleanup_old_audit_logs();

-- audit_logs テーブルを削除
DROP TABLE IF EXISTS public.audit_logs;
