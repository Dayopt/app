-- ユーザーのメール言語設定
ALTER TABLE public.user_settings
ADD COLUMN preferred_locale TEXT NOT NULL DEFAULT 'en'
CHECK (preferred_locale IN ('en', 'ja'));

-- 既存の日本語ユーザーは'ja'にセット（onboarding時のlocaleから推測）
-- 初期マイグレーションでは全員'en'のまま（ユーザーが設定で変更可能）
COMMENT ON COLUMN public.user_settings.preferred_locale IS 'メール等の言語設定 (en/ja)';
