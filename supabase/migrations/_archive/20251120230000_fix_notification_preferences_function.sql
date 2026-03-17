-- ========================================
-- fix_notification_preferences_function.sql
-- 作成日: 2025-11-20
-- 目的: create_default_notification_preferences関数でスキーマを明示的に指定
-- ========================================

-- 関数を再作成（スキーマ名を明示）
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 確認
DO $$
BEGIN
  RAISE NOTICE 'create_default_notification_preferences function updated with explicit schema';
END $$;
