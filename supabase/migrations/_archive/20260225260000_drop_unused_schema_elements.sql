-- 未使用スキーマ要素の削除
-- DBヘルスチェックで検出された未使用テーブル・ビュー・カラムを整理

-- =============================================================
-- Part 1: plan_template_tags テーブル削除（plan_templates の子テーブル）
-- サービス層・UI参照なし、完全未使用
-- =============================================================
DROP TABLE IF EXISTS public.plan_template_tags CASCADE;

-- =============================================================
-- Part 2: plan_templates テーブル削除
-- サービス層・UI参照なし、完全未使用
-- =============================================================
DROP TABLE IF EXISTS public.plan_templates CASCADE;

-- plan_templates 用の updated_at トリガー関数も削除
DROP FUNCTION IF EXISTS public.update_plan_templates_updated_at() CASCADE;

-- =============================================================
-- Part 3: user_recent_logins ビュー削除
-- UI・サービス参照なし
-- =============================================================
DROP VIEW IF EXISTS public.user_recent_logins;

-- =============================================================
-- Part 4: profiles.bio カラム削除
-- 常にnull、UIなし
-- =============================================================
ALTER TABLE public.profiles DROP COLUMN IF EXISTS bio;
