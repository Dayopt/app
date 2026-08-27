-- #2433（台帳 第2段）: 複合 tenant FK の参照先 anchor を追加する。
--
-- Dayopt は所有者整合を**トリガーではなく複合 FK** で守る。子テーブルが
-- `(親の id, user_id)` の 2 列で親を参照すると、他人の行を自分の子に紐づけることが
-- 構造的に不可能になる（`categories` / `activities` / `segments` /
-- `calendar_connections` が既にこの形。20260818120000・20260818130000 参照）。
--
-- 複合 FK の参照先は「列数・順序が一致する UNIQUE 制約」でなければならないため、
-- 親側に `UNIQUE (id, user_id)` が要る。`plans` / `records` / `oauth_connections` には
-- まだ無いので、後続段（Undo substrate / canonical projection）が参照する前に足す。
--
-- なぜ今か: Codex B の攻撃シナリオ 2「receipt → effect → resource を単一 ID FK だけで結ぶ」
-- （#2433 のコメント https://github.com/Dayopt/dayopt/issues/2433#issuecomment-5432218386）
-- は、anchor が無いと「複合 FK を張りたくても張れない」ことから始まる。過去に Calendar の
-- 単一 FK が同型の穴になり複合 FK へ修正した前例がある（20260724000416）。
--
-- expand-only: 純粋な追加のみ。`id` が主キーである以上 `(id, user_id)` は既存行で必ず
-- 一意なので、既存データが制約違反で落ちることは構造的にありえない（下の DO ブロックで
-- 適用前に実測もする）。列の削除・意味変更・backfill は一切行わない。
--
-- `oauth_connections` には既に `UNIQUE (id, user_id, client_id, resource_uri)`
-- （`oauth_connections_binding_key`、20260729062428:88）があるが、**4 列版は複合 FK の
-- 参照先にならない**ので 2 列版を別に足す。
--
-- ロックについて: UNIQUE 制約の追加は index build を伴い ACCESS EXCLUSIVE を取る。
-- `CREATE UNIQUE INDEX CONCURRENTLY` → `ADD CONSTRAINT ... USING INDEX` の 2 段なら
-- ロックを avoid できるが、**CONCURRENTLY は transaction 内で実行できず**、Supabase の
-- migration は 1 ファイル = 1 transaction で走るため使えない。既存 migration と同じく
-- `lock_timeout` を明示し、待たされたら失敗して人間の判断へ戻す方針を取る
-- （20260818130000 と同形）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. 適用前の実測（違反が 0 件であることを確認してから制約を足す）
-- =============================================================================

-- `id` が PK なので理論上 0 件だが、「理論上そうなるはず」と「実際にそうである」は
-- 別物なので測る。1 件でもあれば制約追加は失敗するので、先に分かりやすく落とす。
DO $$
DECLARE
  v_duplicates BIGINT;
BEGIN
  SELECT pg_catalog.count(*) INTO v_duplicates
  FROM (
    SELECT 1 FROM public.plans GROUP BY id, user_id HAVING pg_catalog.count(*) > 1
    UNION ALL
    SELECT 1 FROM public.records GROUP BY id, user_id HAVING pg_catalog.count(*) > 1
    UNION ALL
    SELECT 1 FROM public.oauth_connections GROUP BY id, user_id HAVING pg_catalog.count(*) > 1
  ) AS duplicates;

  IF v_duplicates > 0 THEN
    RAISE EXCEPTION '(id, user_id) is not unique in % row group(s)', v_duplicates
      USING ERRCODE = '23505';
  END IF;
END;
$$;

-- =============================================================================
-- 2. anchor
-- =============================================================================

ALTER TABLE public.plans
  ADD CONSTRAINT plans_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.records
  ADD CONSTRAINT records_id_user_id_unique UNIQUE (id, user_id);

ALTER TABLE public.oauth_connections
  ADD CONSTRAINT oauth_connections_id_user_id_unique UNIQUE (id, user_id);

COMMENT ON CONSTRAINT plans_id_user_id_unique ON public.plans IS
  'Composite tenant FK anchor. Lets child rows bind (plan_id, user_id) so another user''s Plan cannot be referenced.';
COMMENT ON CONSTRAINT records_id_user_id_unique ON public.records IS
  'Composite tenant FK anchor. Lets child rows bind (record_id, user_id) so another user''s Record cannot be referenced.';
COMMENT ON CONSTRAINT oauth_connections_id_user_id_unique ON public.oauth_connections IS
  'Composite tenant FK anchor. Lets child rows bind (connection_id, user_id) so a receipt cannot claim another user''s connection as its origin authority.';

-- =============================================================================
-- 3. 適用後の検証
-- =============================================================================

-- 3 本すべてが「複合 FK の参照先として使える形」で存在することを確認する。
-- 列の順序まで見る（`(user_id, id)` では `(id, user_id)` の FK は張れない）。
DO $$
DECLARE
  v_expected TEXT[][] := ARRAY[
    ARRAY['plans', 'plans_id_user_id_unique'],
    ARRAY['records', 'records_id_user_id_unique'],
    ARRAY['oauth_connections', 'oauth_connections_id_user_id_unique']
  ];
  v_entry TEXT[];
  v_definition TEXT;
BEGIN
  FOREACH v_entry SLICE 1 IN ARRAY v_expected LOOP
    SELECT pg_catalog.pg_get_constraintdef(constraint_entry.oid)
    INTO v_definition
    FROM pg_catalog.pg_constraint AS constraint_entry
    JOIN pg_catalog.pg_class AS relation ON relation.oid = constraint_entry.conrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = v_entry[1]
      AND constraint_entry.conname = v_entry[2];

    IF v_definition IS DISTINCT FROM 'UNIQUE (id, user_id)' THEN
      RAISE EXCEPTION 'anchor % on public.% is % (expected "UNIQUE (id, user_id)")',
        v_entry[2], v_entry[1], coalesce(v_definition, '<missing>')
        USING ERRCODE = '42P10';
    END IF;
  END LOOP;
END;
$$;

COMMIT;
