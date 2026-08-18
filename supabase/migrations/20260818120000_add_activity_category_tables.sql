-- tag-model-replacement Step 1 (epic #2162).
-- Activity / Category の 2 テーブルを追加する。既存 tags には触れない（additive）。
-- tags の廃止と物理削除は Step 7 / Step 8 に隔離する。
--
-- 設計: docs/projects/tag-model-replacement/overview.md
-- 形式: 20260723233814_add_calendar_connection_tables.sql に倣う。
--
-- 単一所属（1 アクティビティは最大 1 カテゴリー）は activities.category_id
-- 1 本で表現する。tags が parent_id + トリガー 2 本（check_tag_hierarchy /
-- check_tag_has_children）で守っていた「最大 1 階層」「自己親禁止」は、親子を
-- 別テーブルへ分けた時点で FK の型が構造的に保証するため移植しない。
--
-- sort_order を持たない（設計 §4-7）。epic が DnD 廃止を確定させている以上、
-- sort_order だけ残すと「DnD の代わりの並べ替え UI」が要る。名前順は UI を
-- 1 つも必要としない。この判断は可逆で、実使用で並べ替えの要求が出たら列を
-- 足せばよい。tags の batch_reorder_* RPC 群も移植しない。
--
-- 所有者整合は複合 FK で担保し、トリガーを使わない。子側の AFTER トリガーは
-- 親の `UPDATE ... SET user_id` を観測できず（20260706120100 が backfill する
-- 羽目になった穴）、ロックを取らない存在確認は race する。RI は参照行に
-- FOR KEY SHARE を取る。先例は calendar_connection_calendars。
--
-- ON DELETE SET NULL (category_id) — 列リストが必須（PG15+、local / production
-- とも 17.6）。裸の SET NULL は参照側の全列を NULL にするため、NOT NULL の
-- user_id が 23502 で落ちる。先例 20260724000416 と同一の理由。MATCH SIMPLE
-- （既定）により category_id IS NULL の行は制約を検査されず、未分類が合法になる。
--
-- GRANT が migration 内で検証される理由: production の pg_default_acl は新規
-- public テーブルに anon/authenticated へ arwdDxtm を既定付与するが、local /
-- Preview は Dxtm のみ。REVOKE 漏れは production でだけテーブルを開き、
-- pnpm rls:snapshot（local 由来・TRUNCATE 非報告）でも CI でも検出できない。
-- §6 の invariant がそれを捕まえる唯一のゲート。
--
-- なお先例 20260723233814 §6 の
--   has_table_privilege(role, tbl, 'SELECT, INSERT, UPDATE, DELETE')
-- はカンマ区切りが OR 判定になり 4 種そろっている証明にならない
-- （20260810085344 が実測で指摘済み）。ここでは 1 privilege ずつ呼んで AND で
-- 結合する。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- 値集合は tags_color_valid_name をそのまま移植する。
  color TEXT,
  icon TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT categories_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT categories_color_valid CHECK (
    color IS NULL OR color IN (
      'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink', 'gray'
    )
  ),
  -- activities の複合 FK の参照先。
  CONSTRAINT categories_id_user_id_unique UNIQUE (id, user_id)
);

CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = 未分類。単一所属は「列が 1 本しかない」ことで構造的に保証される。
  category_id UUID,
  name TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activities_name_not_blank CHECK (length(btrim(name)) > 0),
  -- Step 3 が plans.activity_id / records.activity_id に張る複合 FK の参照先。
  -- ここで作っておかないと Step 3 が着手できない。
  CONSTRAINT activities_id_user_id_unique UNIQUE (id, user_id),
  CONSTRAINT activities_category_owner_fkey
    FOREIGN KEY (category_id, user_id)
    REFERENCES public.categories (id, user_id)
    ON DELETE SET NULL (category_id)
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================

-- カテゴリー内での名前の一意性。tags_user_parent_name_unique に対応するが、
-- 述語から is_active が消える（新モデルは archived_at 単独で状態を表す）。
--
-- カテゴリーをまたいだ同名（仕事/レビュー と 学習/レビュー）は許す。ネストと
-- カテゴリー色で区別できる。サイドバーの「カテゴリー配下を名前順」もこの
-- index で読める。
CREATE UNIQUE INDEX activities_user_category_name_unique
  ON public.activities (user_id, category_id, name)
  WHERE category_id IS NOT NULL AND archived_at IS NULL;

-- 未分類（category_id IS NULL）の同名は意図的に許す。
--
-- 上の index は NULL 行を対象にしないので、tags_user_root_name_unique に倣って
-- 未分類側にも UNIQUE を置くことはできる。置かないのは、置くと壊れるため:
-- カテゴリー削除時に ON DELETE SET NULL が配下 activity を未分類へ落とす際、
-- 同名が既に未分類にあると 23505 で DELETE ごと abort し、そのカテゴリーが
-- 二度と削除できなくなる（local で再現確認済み）。カテゴリーまたぎの同名を
-- 許す以上この衝突は通常操作で到達するため、index を置かないことで
-- 「SET NULL が失敗しうる」クラスごと無くす。
--
-- 既存 tags は root 側に同型の UNIQUE を持つため production で同じバグを抱えて
-- いるが、tags は Step 8 で廃止されるため修正しない（#2162 で裁定）。
-- 未分類に同名が並ぶ見づらさは UI 側で解く。

CREATE UNIQUE INDEX categories_user_name_unique
  ON public.categories (user_id, name)
  WHERE archived_at IS NULL;

-- 未分類アクティビティの名前順読み出し用。上の 2 本はどちらも
-- category_id IS NULL の行を名前順に引く用途をカバーしない。
CREATE INDEX activities_user_name_idx
  ON public.activities (user_id, name);

-- =============================================================================
-- 3. updated_at
-- =============================================================================
-- 既存の public.update_updated_at() を再利用する。

CREATE TRIGGER trigger_update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trigger_update_activities_updated_at
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 4. RLS
-- =============================================================================
-- auth.uid() は (SELECT auth.uid()) でラップする。20260318083030 の initplan
-- 最適化で、行ごとの再評価を防ぐ。既存 tags の policy も全てこの形。

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own categories" ON public.categories
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own categories" ON public.categories
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own categories" ON public.categories
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own categories" ON public.categories
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can view own activities" ON public.activities
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own activities" ON public.activities
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can update own activities" ON public.activities
  FOR UPDATE USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own activities" ON public.activities
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

-- =============================================================================
-- 5. Grants
-- =============================================================================
-- tags と同じ「authenticated に table-level DML を渡し RLS で守る」パターン。
-- ただし anon には一切与えない。tags の anon grant は 20260810085344 が Tier 2
-- として意図的に残した歴史的経緯であり、新規に再現する理由がない。

REVOKE ALL ON TABLE public.categories, public.activities
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.categories, public.activities
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.categories, public.activities
  TO service_role;

-- =============================================================================
-- 6. Privilege invariants
-- =============================================================================

DO $$
DECLARE
  new_tables TEXT[] := ARRAY['public.categories', 'public.activities'];
  dml_privileges TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  target_table TEXT;
  privilege TEXT;
BEGIN
  FOREACH target_table IN ARRAY new_tables LOOP
    -- anon は 1 つも持たない。
    FOREACH privilege IN ARRAY dml_privileges LOOP
      IF has_table_privilege('anon', target_table, privilege) THEN
        RAISE EXCEPTION 'anon must not hold % on %', privilege, target_table;
      END IF;
    END LOOP;

    -- TRUNCATE は RLS で制御できないため、両ロールから明示的に否定する。
    IF has_table_privilege('anon', target_table, 'TRUNCATE')
      OR has_table_privilege('authenticated', target_table, 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'browser roles must not hold TRUNCATE on %', target_table;
    END IF;

    -- authenticated / service_role は DML 4 種すべてを持つ。
    -- カンマ区切りは OR 判定になるので 1 つずつ呼んで AND で結合する。
    FOREACH privilege IN ARRAY dml_privileges LOOP
      IF NOT has_table_privilege('authenticated', target_table, privilege) THEN
        RAISE EXCEPTION 'authenticated is missing % on %', privilege, target_table;
      END IF;
      IF NOT has_table_privilege('service_role', target_table, privilege) THEN
        RAISE EXCEPTION 'service_role is missing % on %', privilege, target_table;
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- =============================================================================
-- 7. Composite FK invariant
-- =============================================================================
-- ON DELETE SET NULL が category_id だけを対象にしていることを確認する。
-- user_id まで NULL 化する形になっていると、カテゴリー削除が 23502 で落ちる。
-- 検査の形は先例 20260724000416 に倣う。

DO $$
DECLARE
  delete_action "char";
  null_columns SMALLINT[];
  referencing_columns SMALLINT[];
  category_id_attnum SMALLINT;
BEGIN
  SELECT confdeltype, confdelsetcols, conkey
  INTO delete_action, null_columns, referencing_columns
  FROM pg_constraint
  WHERE conrelid = 'public.activities'::regclass
    AND conname = 'activities_category_owner_fkey'
    AND contype = 'f';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'activities_category_owner_fkey was not created';
  END IF;

  IF array_length(referencing_columns, 1) <> 2 THEN
    RAISE EXCEPTION 'the category FK must cover (category_id, user_id)';
  END IF;

  IF delete_action <> 'n' THEN
    RAISE EXCEPTION 'the category FK must use ON DELETE SET NULL, found %', delete_action;
  END IF;

  SELECT attnum
  INTO category_id_attnum
  FROM pg_attribute
  WHERE attrelid = 'public.activities'::regclass
    AND attname = 'category_id'
    AND NOT attisdropped;

  IF null_columns IS DISTINCT FROM ARRAY[category_id_attnum]::SMALLINT[] THEN
    RAISE EXCEPTION 'ON DELETE SET NULL must name category_id only';
  END IF;
END;
$$;

COMMIT;
