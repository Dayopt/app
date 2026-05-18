-- ============================================================
-- Dayopt 開発用シードデータ
-- ============================================================
-- `supabase db reset` 実行時に自動的に読み込まれる
-- ローカル / staging 環境専用（本番では実行しない）
--
-- テストユーザー + 2週間分のリアルなデータ → 統計・振り返り機能が即テスト可能
-- ============================================================

-- ============================================================
-- テストユーザー
-- ============================================================

-- テストユーザーをauth.usersに作成（ローカルInbucket用）
-- パスワード: TestPassword123!
INSERT INTO auth.users (
  id,
  instance_id,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  role,
  aud,
  confirmation_token
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'test@dayopt.dev',
  crypt('TestPassword123!', gen_salt('bf')),
  now(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Test User"}',
  now(),
  now(),
  'authenticated',
  'authenticated',
  ''
);

-- identityも作成（ログインに必要）
INSERT INTO auth.identities (
  id,
  user_id,
  provider_id,
  provider,
  identity_data,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'test@dayopt.dev',
  'email',
  '{"sub": "00000000-0000-0000-0000-000000000001", "email": "test@dayopt.dev"}',
  now(),
  now(),
  now()
);

-- NOTE: profiles は auth.users INSERT 時に handle_new_user() トリガーで自動作成

-- ============================================================
-- ユーザー設定
-- ============================================================

INSERT INTO public.user_settings (user_id, timezone, time_format, week_starts_on, default_duration, chronotype_settings)
VALUES ('00000000-0000-0000-0000-000000000001', 'Asia/Tokyo', '24h', 1, 60, '{"type": "bear"}');

-- ============================================================
-- タグ（5つの基本カテゴリ）
-- ============================================================

INSERT INTO public.tags (id, user_id, name, color, sort_order) VALUES
  ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'dev:api',      'blue',   0),
  ('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'dev:frontend',  'indigo', 1),
  ('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'meeting',       'orange', 2),
  ('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'learning',      'green',  3),
  ('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'personal',      'pink',   4);

-- ============================================================
-- エントリ（2週間分: 今日を基準に14日前〜今日）
-- ============================================================
-- 平日は4-6エントリ/日、週末は1-2エントリ/日
-- origin='planned' メイン、一部 'unplanned'
-- fulfillment_score: 1-3のリアルな分布

DO $$
DECLARE
  v_user_id UUID := '00000000-0000-0000-0000-000000000001';
  v_date DATE;
  v_entry_id UUID;
  v_dow INT;
  v_tag_ids UUID[] := ARRAY[
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005'
  ];
BEGIN
  FOR i IN 0..13 LOOP
    v_date := CURRENT_DATE - (13 - i);
    v_dow := EXTRACT(DOW FROM v_date)::INT; -- 0=Sun, 6=Sat

    IF v_dow NOT IN (0, 6) THEN
      -- 平日: 朝の集中タイム (9:00-11:00) → dev:api
      INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
      VALUES (gen_random_uuid(), v_user_id, 'API開発',
        (v_date || ' 09:00:00')::TIMESTAMPTZ,
        (v_date || ' 11:00:00')::TIMESTAMPTZ,
        (v_date || ' 09:00:00')::TIMESTAMPTZ,
        (v_date || ' 11:00:00')::TIMESTAMPTZ,
        'planned', (ARRAY[2, 3, 3, 2, 3])[i % 5 + 1], v_tag_ids[1]);

      -- 午前ミーティング (11:00-12:00)
      INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
      VALUES (gen_random_uuid(), v_user_id, 'チームスタンドアップ',
        (v_date || ' 11:00:00')::TIMESTAMPTZ,
        (v_date || ' 11:30:00')::TIMESTAMPTZ,
        (v_date || ' 11:00:00')::TIMESTAMPTZ,
        (v_date || ' 11:30:00')::TIMESTAMPTZ,
        'planned', (ARRAY[2, 2, 1, 2, 2])[i % 5 + 1], v_tag_ids[3]);

      -- 午後のフロントエンド開発 (13:00-15:00)
      INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
      VALUES (gen_random_uuid(), v_user_id, 'UIコンポーネント実装',
        (v_date || ' 13:00:00')::TIMESTAMPTZ,
        (v_date || ' 15:00:00')::TIMESTAMPTZ,
        (v_date || ' 13:00:00')::TIMESTAMPTZ,
        (v_date || ' 15:00:00')::TIMESTAMPTZ,
        'planned', (ARRAY[3, 2, 3, 3, 2])[i % 5 + 1], v_tag_ids[2]);

      -- 午後の学習 (15:30-16:30) — 隔日
      IF i % 2 = 0 THEN
        INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
        VALUES (gen_random_uuid(), v_user_id, 'TypeScript勉強会',
          (v_date || ' 15:30:00')::TIMESTAMPTZ,
          (v_date || ' 16:30:00')::TIMESTAMPTZ,
          (v_date || ' 15:30:00')::TIMESTAMPTZ,
          (v_date || ' 16:30:00')::TIMESTAMPTZ,
          'planned', 3, v_tag_ids[4]);
      END IF;

      -- 突発タスク（unplanned、一部の日のみ）unplanned は planned 時間を持たない
      IF i % 3 = 0 THEN
        INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
        VALUES (gen_random_uuid(), v_user_id, '緊急バグ対応',
          NULL,
          NULL,
          (v_date || ' 16:30:00')::TIMESTAMPTZ,
          (v_date || ' 17:30:00')::TIMESTAMPTZ,
          'unplanned', 1, v_tag_ids[1]);
      END IF;

    ELSE
      -- 週末: 個人タスク (10:00-12:00)
      INSERT INTO public.entries (id, user_id, title, start_time, end_time, actual_start_time, actual_end_time, origin, fulfillment_score, tag_id)
      VALUES (gen_random_uuid(), v_user_id, '個人プロジェクト',
        (v_date || ' 10:00:00')::TIMESTAMPTZ,
        (v_date || ' 12:00:00')::TIMESTAMPTZ,
        (v_date || ' 10:00:00')::TIMESTAMPTZ,
        (v_date || ' 12:00:00')::TIMESTAMPTZ,
        'planned', 3, v_tag_ids[5]);
    END IF;
  END LOOP;
END $$;
