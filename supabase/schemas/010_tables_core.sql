-- ============================================================
-- コアテーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- Dayopt のドメインモデルの中核テーブル
-- 実際のマイグレーションは migrations/ を参照
-- ============================================================

-- profiles: ユーザープロフィール
-- auth.users 作成時に handle_new_user() トリガーで自動生成
-- id = auth.users.id（1:1対応）
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,          -- メール@前から自動生成、重複時はsuffix付与
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  onboarding_completed_at TIMESTAMPTZ  -- オンボーディング完了日時
);

-- entries: エントリ（プラン + 記録 統合テーブル）
-- origin='planned' → 事前に計画したタイムボックス
-- origin='unplanned' → 実行後に記録した時間
-- reviewed_at IS NOT NULL → 完了済み（旧statusカラムを置換）
CREATE TABLE public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ,       -- カレンダー上の開始時刻
  end_time TIMESTAMPTZ,         -- カレンダー上の終了時刻
  recurrence_type TEXT NOT NULL DEFAULT 'none',  -- none/daily/weekly/monthly/yearly/weekdays
  recurrence_end_date DATE,
  recurrence_rule TEXT,          -- RFC 5545 RRULE（複雑な繰り返し用）
  reminder_enabled BOOLEAN NOT NULL DEFAULT false, -- リマインダーON/OFF
  reminder_at TIMESTAMPTZ,       -- 自動計算: reminder_enabled=true → start_time
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,       -- 完了マーク日時
  origin TEXT NOT NULL DEFAULT 'planned',
  fulfillment_score INTEGER,     -- 充実度 1-3（低/中/高）
  duration_minutes INTEGER,      -- 手動入力の所要時間（start/end未設定時）
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
  color TEXT,                    -- red/orange/amber/green/teal/blue/indigo/violet/pink/gray
  is_active BOOLEAN NOT NULL DEFAULT true,  -- false = ソフトデリート（マージ時）
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

-- entry_tags: エントリとタグの関連
-- UNIQUE(entry_id) → 1エントリに1タグのみ
CREATE TABLE public.entry_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE UNIQUE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- entry_instances: 繰り返しエントリの例外インスタンス
-- 特定日の変更（時間変更/キャンセル/移動）を管理
CREATE TABLE public.entry_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  instance_date DATE NOT NULL,
  instance_start TIMESTAMPTZ,
  instance_end TIMESTAMPTZ,
  exception_type TEXT,           -- modified/cancelled/moved
  original_date DATE,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, instance_date)
);

-- user_settings: ユーザー設定（1ユーザー1レコード）
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 時間設定
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  time_format TEXT NOT NULL DEFAULT '24h',     -- 24h / 12h
  week_starts_on SMALLINT NOT NULL DEFAULT 1,  -- 0=Sun, 1=Mon, 6=Sat
  default_duration INTEGER NOT NULL DEFAULT 60,
  snap_interval SMALLINT NOT NULL DEFAULT 15,  -- 5/10/15/30分
  business_hours_start SMALLINT NOT NULL DEFAULT 9,
  business_hours_end SMALLINT NOT NULL DEFAULT 18,
  -- 表示設定
  show_utc_offset BOOLEAN NOT NULL DEFAULT true,
  show_weekends BOOLEAN NOT NULL DEFAULT true,
  show_week_numbers BOOLEAN NOT NULL DEFAULT false,
  show_declined_events BOOLEAN NOT NULL DEFAULT false,
  default_view TEXT NOT NULL DEFAULT 'week',
  hour_height_density TEXT NOT NULL DEFAULT 'default',
  -- クロノタイプ
  chronotype_enabled BOOLEAN NOT NULL DEFAULT true,
  chronotype_type TEXT NOT NULL DEFAULT 'bear',  -- bear/lion/wolf/dolphin/custom
  chronotype_custom_zones JSONB,
  chronotype_display_mode TEXT NOT NULL DEFAULT 'border',
  chronotype_opacity SMALLINT NOT NULL DEFAULT 90,
  -- プラン/記録モード
  plan_record_mode TEXT NOT NULL DEFAULT 'both',  -- plan/record/both
  -- テーマ
  theme TEXT NOT NULL DEFAULT 'system',
  color_scheme TEXT NOT NULL DEFAULT 'blue',
  date_format TEXT NOT NULL DEFAULT 'yyyy/MM/dd',
  -- AI設定
  personalization_values JSONB DEFAULT '{}',
  ai_communication_style TEXT DEFAULT 'coach',
  ai_custom_style_prompt TEXT DEFAULT '',
  personalization_ranked_values JSONB DEFAULT '[]',
  -- メタ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
