-- 20260414130000 の修正版（冪等リトライ用）
-- 20260414130000 が CASCADE で成功した場合でも安全に再実行できる

-- 1. 正しいトリガー名で削除（IF EXISTS なので既に消えていても安全）
DROP TRIGGER IF EXISTS on_auth_user_created_notification_preferences ON auth.users;
DROP TRIGGER IF EXISTS create_default_notification_preferences_trigger ON auth.users;

-- 2. CASCADE でトリガー関数を削除（依存があっても通る、既になければ無視）
DROP FUNCTION IF EXISTS public.create_default_notification_preferences() CASCADE;

-- 3. RLS ポリシーを削除（テーブルが既に消えている場合は例外を無視）
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
  DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
  DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- 4. テーブルを削除（IF EXISTS なので既に消えていても安全）
DROP TABLE IF EXISTS public.notification_preferences;
