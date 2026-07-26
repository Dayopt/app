-- ============================================================
-- コアテーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- Dayopt のドメインモデルの中核テーブル
-- 実際のマイグレーションは migrations/ を参照
-- 最終同期日: 2026-07-24
-- 同期対象 migration:
--   - 20260415000000_inline_entry_tag_id.sql
--   - 20260424000000_restore_tag_parent_hierarchy.sql
--   - 20260425110000_fix_tag_children_trigger_active_only.sql
--   - 20260610000000_entry_auto_record_model.sql
--   - 20260616000000_rename_duration_to_planned_duration.sql
--   - 20260708232500_add_time_model_tables.sql
--   - 20260712212527_records_table_and_drop_entries.sql
--   - 20260712213550_rename_record_constraint_triggers.sql
--   - 20260723233814_add_calendar_connection_tables.sql
--   - 20260724000416_enforce_external_event_connection_owner.sql
--   - 20260726033000_expand_user_data_purge_generation.sql
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

-- calendar_connections: 外部カレンダーのアカウント接続（Phase 2 / external-calendar-import）
-- 同一 provider の複数アカウントを許容する（UNIQUE は user_id + provider + provider_account_id）
-- access token は保存しない。refresh_token_enc は AES-256-GCM 暗号文
-- refresh_token_enc / granted_scopes / provider_account_id は authenticated へ grant しない
-- （column-scoped SELECT。詳細は rls-snapshot.md）
CREATE TABLE public.calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,                 -- google 等。free text + not-blank（enum 不使用）
  provider_account_id TEXT NOT NULL,      -- Google の sub
  provider_account_email TEXT,
  granted_scopes TEXT[] NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  data_generation BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL,                   -- active / reauth_required
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- calendar_connections 関連 constraint / trigger:
--   calendar_connections_status_check             -> status IN ('active','reauth_required')
--   calendar_connections_granted_scopes_not_empty -> cardinality > 0 かつ NULL 要素なし
--   calendar_connections_id_user_id_unique        -> 子テーブルの複合 FK 参照先
--   calendar_connections_provider_account_unique  -> user_id + provider + provider_account_id
--   data_generation -> 接続保存時のuser data purge世代。古いcallback/syncの再作成を拒否する
--   trigger_update_calendar_connections_updated_at -> update_updated_at()

-- calendar_connection_calendars: 取り込み対象として選択されたカレンダー
-- 選択可能な一覧は provider API からオンデマンド取得し保存しない
-- sync_token は per-calendar cursor（NULL = 次回 full sync）
CREATE TABLE public.calendar_connection_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_calendar_id TEXT NOT NULL,
  calendar_name TEXT,
  sync_token TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- calendar_connection_calendars 関連 constraint / trigger:
--   calendar_connection_calendars_connection_owner_fkey
--     -> (connection_id, user_id) が calendar_connections(id, user_id) を参照（ON DELETE CASCADE）
--        owner 整合は constraint trigger ではなくこの複合 FK で担保する
--   calendar_connection_calendars_provider_calendar_unique -> connection_id + provider_calendar_id
--   trigger_update_calendar_connection_calendars_updated_at -> update_updated_at()

-- external_calendar_events: 外部カレンダー同期ミラー
-- Phase 1 では FK の受け皿だけを追加し、OAuth / sync / ghost UI は Phase 2 で実装する
-- connection_id は Phase 2 で追加。切断後も plans / records が参照する行は履歴の
-- アンカーとして残るため CASCADE にしない
CREATE TABLE public.external_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID,
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

-- external_calendar_events 関連 constraint / index:
--   external_calendar_events_provider_event_unique
--     -> user_id + provider + connection_id + provider_calendar_id + provider_event_id
--        connection_id を含むのは、同一 provider の複数アカウントが同じ共有カレンダーを
--        購読しても行が衝突しないようにするため
--   external_calendar_events_connection_owner_fkey
--     -> (connection_id, user_id) が calendar_connections(id, user_id) を参照。
--        ON DELETE SET NULL (connection_id) — 列リスト指定が必須（bare SET NULL だと
--        NOT NULL の user_id まで NULL 化しようとして 23502 になる）。
--        MATCH SIMPLE なので connection_id が NULL の孤立行は検査対象外

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

-- records: Dayopt 内の記録
CREATE TABLE public.records (
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
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- records 関連 constraint / trigger:
--   records_no_overlap                    -> user_id + tstzrange(start_at, end_at, '[)') EXCLUDE
--   prevent_records_source_change         -> prevent_time_model_source_change()
--   enforce_record_tag_owner              -> enforce_record_tag_owner()
--   enforce_record_plan_owner             -> enforce_record_plan_owner()
--   enforce_record_external_event_owner   -> enforce_record_external_event_owner()

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

-- entries / entry_tags: 削除済み
--   20260415000000_inline_entry_tag_id.sql
--   20260712212527_records_table_and_drop_entries.sql

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
