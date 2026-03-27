-- Chronotype gradient CSS 文字列を保存するカラムを追加
-- サーバー側で事前計算した linear-gradient を light/dark 2 本保存
ALTER TABLE user_settings
  ADD COLUMN chronotype_gradient_light TEXT,
  ADD COLUMN chronotype_gradient_dark TEXT;

-- 使われなくなったカラムを削除（bf553d719 でアプリ側は削除済み）
ALTER TABLE user_settings
  DROP COLUMN IF EXISTS chronotype_display_mode,
  DROP COLUMN IF EXISTS chronotype_opacity;
