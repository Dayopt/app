-- ============================================================
-- コアテーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- Dayopt のドメインモデルの中核テーブル
-- 実際のマイグレーションは migrations/ を参照
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
  duration_minutes INTEGER GENERATED ALWAYS AS (
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

-- tags: タグ（フラット構造）
-- コロン記法 "dev:api" で2階層を表現（DBには階層なし）
-- color はプリセット名（hex値ではない）
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,                     -- red/orange/amber/green/teal/blue/indigo/violet/pink/gray
  icon TEXT,                      -- Lucideアイコン名
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,  -- false = ソフトデリート（マージ時）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

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
