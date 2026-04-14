-- 20260414130000 の修正版
-- トリガー名が実際は on_auth_user_created_notification_preferences だったため再実行

-- 1. 正しいトリガー名で削除
DROP TRIGGER IF EXISTS on_auth_user_created_notification_preferences ON auth.users;
DROP TRIGGER IF EXISTS create_default_notification_preferences_trigger ON auth.users;

-- 2. CASCADE でトリガー関数を削除（依存があっても通る）
DROP FUNCTION IF EXISTS public.create_default_notification_preferences() CASCADE;

-- 3. RLS ポリシーを削除
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;

-- 4. テーブルを削除
DROP TABLE IF EXISTS public.notification_preferences;
