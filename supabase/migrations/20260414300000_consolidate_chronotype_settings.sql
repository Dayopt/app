-- ============================================================
-- user_settings: クロノタイプ5カラム → chronotype_settings jsonb に統合
-- null = 未設定/無効、{ type: 'bear' } のようにユーザー選択のみ保存
-- gradient/zones はアプリ層で type から導出する
-- ============================================================

-- 1. 新カラム追加
ALTER TABLE public.user_settings ADD COLUMN chronotype_settings jsonb;

-- 2. データ移行: enabled=true のレコードのみ値を設定
-- custom タイプは bear にフォールバック（custom 廃止）
UPDATE public.user_settings
SET chronotype_settings = jsonb_build_object(
  'type', CASE WHEN chronotype_type = 'custom' THEN 'bear' ELSE chronotype_type END
)
WHERE chronotype_enabled = true;

-- 3. 旧制約を先に削除（カラム削除前）
ALTER TABLE public.user_settings DROP CONSTRAINT IF EXISTS user_settings_chronotype_type_check;

-- 4. 旧カラム削除
ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS chronotype_enabled,
  DROP COLUMN IF EXISTS chronotype_type,
  DROP COLUMN IF EXISTS chronotype_custom_zones,
  DROP COLUMN IF EXISTS chronotype_gradient_light,
  DROP COLUMN IF EXISTS chronotype_gradient_dark;
