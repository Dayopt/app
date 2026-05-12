-- notification_preferences テーブルを削除
-- 理由: 全設定項目が未実装機能のスイッチのため不要
-- 将来必要になった場合は profiles に jsonb カラムで吸収可能

-- 1. auth.users INSERT トリガーを削除
DROP TRIGGER IF EXISTS create_default_notification_preferences_trigger ON auth.users;

-- 2. トリガー関数を削除
DROP FUNCTION IF EXISTS public.create_default_notification_preferences() CASCADE;

-- 3. RLS ポリシーを削除
DROP POLICY IF EXISTS "Users can view own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can insert own notification preferences" ON public.notification_preferences;
DROP POLICY IF EXISTS "Users can update own notification preferences" ON public.notification_preferences;

-- 4. テーブルを削除
DROP TABLE IF EXISTS public.notification_preferences;
