-- ============================================================
-- コアテーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- Dayopt のドメインモデルの中核テーブル
-- 実際のマイグレーションは migrations/ を参照
-- 最終同期日: 2026-07-09
-- 同期対象 migration:
--   - 20260415000000_inline_entry_tag_id.sql
--   - 20260424000000_restore_tag_parent_hierarchy.sql
--   - 20260425110000_fix_tag_children_trigger_active_only.sql
--   - 20260610000000_entry_auto_record_model.sql
--   - 20260616000000_rename_duration_to_planned_duration.sql
--   - 20260708232500_add_time_model_tables.sql
--
-- カラム順序の規則:
--   1. id (PK)
--   2. user_id (FK/所有者)
--   3. 外部キー
--   4. ビジネスカラム
--   5. ステータス/フラグ
--   6. メタ (created_at, updated_at, deleted_at)
-- ============================================================

-- profiles: ユーザープロフィール
-- auth.users 作成時に handle_new_user() トリガーで自動生成
-- id = auth.users.id（1:1対応）
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,                 -- 表示名
  avatar_url TEXT,
  stripe_customer_id TEXT,       -- Stripe顧客ID
  subscription_id TEXT,          -- Stripeサブスクリプション ID
  subscription_status TEXT NOT NULL DEFAULT 'free', -- free / trialing / active / canceled / past_due
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- entries: エントリ（プラン + 記録 統合テーブル）
-- origin='planned' → 事前に計画したタイムボックス
-- origin='unplanned' → 実行後に記録した時間
-- fulfillment_score IS NOT NULL → レビュー済み
-- 自動記録モデル（20260610000000）: actual_* は「ユーザーが編集・確定した実績」のみ
-- （NULL = 未編集）。過去になった planned は読み取り時に plan range を実績として扱う
-- （entries_effective view が唯一の定義）。skipped_at は「計画したがやらなかった」
CREATE TABLE public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  origin TEXT NOT NULL DEFAULT 'planned',
  start_time TIMESTAMPTZ,         -- カレンダー上の開始時刻
  end_time TIMESTAMPTZ,           -- カレンダー上の終了時刻
  actual_start_time TIMESTAMPTZ,  -- 実績開始時刻
  actual_end_time TIMESTAMPTZ,    -- 実績終了時刻
  planned_duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL
      THEN EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / 60
      ELSE NULL
    END
  ) STORED,
  fulfillment_score INTEGER,      -- 充実度 1-3（低/中/高）
  skipped_at TIMESTAMPTZ,         -- 計画したがやらなかった（自動記録・実績集計から除外）
  deleted_at TIMESTAMPTZ,         -- ソフトデリート
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- entries.tag_id は nullable FK に加えて、trigger で tags.user_id = entries.user_id を強制する。
--   enforce_entry_tag_owner -> enforce_entry_tag_owner()

-- external_calendar_events: 外部カレンダー同期ミラー
-- Phase 1 では FK の受け皿だけを追加し、OAuth / sync / ghost UI は Phase 2 で実装する
CREATE TABLE public.external_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_calendar_id TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  calendar_name TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  dismissed_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- plans: Dayopt 内の予定
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  external_calendar_event_id UUID REFERENCES public.external_calendar_events(id),
  title TEXT NOT NULL,
  note TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  skipped_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual', -- manual / external_calendar / api
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- plans 関連 constraint / trigger:
--   plans_no_overlap                    -> user_id + tstzrange(start_at, end_at, '[)') EXCLUDE
--   prevent_plans_source_change         -> prevent_time_model_source_change()
--   enforce_plan_tag_owner              -> enforce_plan_tag_owner()
--   enforce_plan_external_event_owner   -> enforce_plan_external_event_owner()

-- logs: Dayopt 内の記録
CREATE TABLE public.logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.plans(id),
  external_calendar_event_id UUID REFERENCES public.external_calendar_events(id),
  title TEXT NOT NULL,
  note TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual', -- manual / from_plan / auto_migrated / external_calendar / api
  fulfillment_score INTEGER,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- logs 関連 constraint / trigger:
--   logs_no_overlap                    -> user_id + tstzrange(start_at, end_at, '[)') EXCLUDE
--   prevent_logs_source_change         -> prevent_time_model_source_change()
--   enforce_log_tag_owner              -> enforce_log_tag_owner()
--   enforce_log_plan_owner             -> enforce_log_plan_owner()
--   enforce_log_external_event_owner   -> enforce_log_external_event_owner()

-- tags: タグ（root -> child の最大2階層）
-- 20260424000000 でコロン記法 "dev:api" から parent_id 階層へ移行済み
-- parent_id IS NULL が root、parent_id NOT NULL が child
-- 階層は trigger で最大1段に制限（grandchild不可 / 自己参照不可）
-- active child を持つ tag は child に移動できない（inactive child は除外）
-- color はプリセット名（hex値ではない）
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tags(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  color TEXT,                     -- red/orange/amber/green/teal/blue/indigo/violet/pink/gray
  icon TEXT,                      -- Lucideアイコン名
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- false = ソフトデリート（マージ時）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tags_parent_id ON public.tags(parent_id);
CREATE INDEX idx_tags_user_parent_sort_order
  ON public.tags(user_id, parent_id, sort_order);

-- active tag の名前重複だけを禁止する partial unique index
-- root 同士: 同一 user_id + name
-- child 同士: 同一 user_id + parent_id + name
CREATE UNIQUE INDEX tags_user_root_name_unique
  ON public.tags(user_id, name)
  WHERE parent_id IS NULL AND is_active = true;

CREATE UNIQUE INDEX tags_user_parent_name_unique
  ON public.tags(user_id, parent_id, name)
  WHERE parent_id IS NOT NULL AND is_active = true;

-- tags 関連 trigger:
--   enforce_tag_hierarchy             -> check_tag_hierarchy()
--   enforce_tag_no_children_as_child  -> check_tag_has_children()
--   trigger_update_tags_updated_at    -> update_updated_at()

-- entry_tags: 削除済み（20260415000000_inline_entry_tag_id.sql）
-- entries.tag_id に統合

-- entry_instances: 削除済み（20260319130003_cleanup_recurrence_remnants.sql）

-- user_settings: ユーザー設定（1ユーザー1レコード）
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 時間
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  time_format TEXT NOT NULL DEFAULT '24h',      -- 24h / 12h
  week_starts_on SMALLINT NOT NULL DEFAULT 1,   -- 0=Sun, 1=Mon, 6=Sat
  default_duration INTEGER NOT NULL DEFAULT 60,
  snap_interval SMALLINT NOT NULL DEFAULT 15,   -- 5/10/15/30分
  -- 表示
  show_weekends BOOLEAN NOT NULL DEFAULT true,
  show_week_numbers BOOLEAN NOT NULL DEFAULT false,
  default_view TEXT NOT NULL DEFAULT 'week',
  hour_height_density TEXT NOT NULL DEFAULT 'default', -- compact / default / comfortable
  -- クロノタイプ
  chronotype_settings JSONB,      -- { type: 'bear'|'lion'|'wolf'|'dolphin' } or null
  -- ロケール
  preferred_locale TEXT NOT NULL DEFAULT 'en',   -- en / ja
  -- テーマ
  theme TEXT NOT NULL DEFAULT 'system',
  -- パーソナライゼーション（将来のAI機能用、構造未定）
  personalization JSONB,
  -- iCalフィード
  ical_feed_token UUID DEFAULT gen_random_uuid(), -- iCal連携用トークン
  -- メタ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
