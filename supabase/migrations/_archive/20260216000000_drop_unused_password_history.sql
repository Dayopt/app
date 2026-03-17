-- password_history テーブルと関連関数の削除
-- 理由: TypeScriptコードからの呼び出しゼロ。参照先の src/lib/auth/password-history.ts は未実装。
-- パスワードハッシュを不要に保持しておりセキュリティリスクとなるため削除。

DROP FUNCTION IF EXISTS public.check_password_reuse(uuid, text);
DROP FUNCTION IF EXISTS public.add_password_to_history(uuid, text);
DROP FUNCTION IF EXISTS public.get_password_history_count(uuid);
DROP TABLE IF EXISTS public.password_history;
