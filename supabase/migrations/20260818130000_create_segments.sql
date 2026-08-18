-- #2162 Step 5: セグメント（分析用の保存されたクエリ）を追加する。
--
-- 3 構造モデル（アクティビティ / カテゴリー / セグメント）のうち、セグメントだけが
-- 「所属」ではなく「横断参照」を担う。カテゴリーとアクティビティが分割（重複なし）で
-- 合計の足し算が合うのに対し、**セグメントは重複しうる**。この違いが schema にも出る:
-- segment_activities は多対多で、1 アクティビティが複数セグメントに入ってよい。
--
-- 設計上の制約（docs/projects/tag-model-replacement/overview.md §4-3・§6-3・§6-4）:
-- - セグメントに保存させるのは**アクティビティの集合だけ**。期間・指標・グルーピング・
--   並べ替えの列を持たせない。列を足さないこと自体がレポートビルダー化への制約になる
-- - `plans` / `records` にセグメントを指す列は作らない。セグメントが第 2 の分類軸へ
--   育つ道を構造で塞ぐ
-- - セグメントはアクティビティだけを束ねる。カテゴリーを直接メンバーにできない
--   （カテゴリー単位の合計は rollup で出るので、両方許すと同じ数字への 2 つの道ができる）
--
-- 所有者整合はトリガーではなく複合 FK で守る（categories / activities と同じ形）。
-- segment_activities は segments と activities の両方へ (id, user_id) で参照するため、
-- 他ユーザーの activity をセグメントへ混ぜることが構造的に不可能になる。
--
-- 依存: activities テーブル（Step 1、20260818120000）。複合 FK の参照先である
-- activities_id_user_id_unique がそちらで作られるため、本 migration は後に適用される。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. segments
-- =============================================================================

CREATE TABLE public.segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT segments_user_id_name_unique UNIQUE (user_id, name),
  -- segment_activities からの複合 FK 参照先
  CONSTRAINT segments_id_user_id_unique UNIQUE (id, user_id),
  -- categories / activities の *_name_not_blank と同形
  CONSTRAINT segments_name_not_blank CHECK (length(btrim(name)) > 0)
);

-- =============================================================================
-- 2. segment_activities（多対多。セグメントが重複しうることの実体）
-- =============================================================================

-- 代理キーを持たせない。(segment_id, activity_id) が自然キーであり、
-- junction table に surrogate id を足しても参照する側がいない。
CREATE TABLE public.segment_activities (
  segment_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT segment_activities_pkey PRIMARY KEY (segment_id, activity_id),
  -- 所有者整合を複合 FK で守る（トリガー不要）
  CONSTRAINT segment_activities_segment_owner_fkey
    FOREIGN KEY (segment_id, user_id)
    REFERENCES public.segments (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT segment_activities_activity_owner_fkey
    FOREIGN KEY (activity_id, user_id)
    REFERENCES public.activities (id, user_id)
    ON DELETE CASCADE
);

-- 「このアクティビティが属するセグメント」の逆引き（アクティビティ削除時の影響確認）。
-- 順方向（segment_id からの引き当て）は PRIMARY KEY の先頭列で賄えるため索引を足さない。
CREATE INDEX segment_activities_activity_id_idx
  ON public.segment_activities (activity_id);

-- =============================================================================
-- 3. RLS
-- =============================================================================

ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.segment_activities ENABLE ROW LEVEL SECURITY;

-- UPDATE には最初から WITH CHECK を付ける。tags は USING のみで作られ、
-- 20260430000000 で後追い修正された不備がある（USING だけだと user_id を
-- 他人の値へ書き換える UPDATE が通ってしまう）。
CREATE POLICY "Users can view own segments" ON public.segments
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own segments" ON public.segments
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own segments" ON public.segments
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own segments" ON public.segments
  FOR DELETE USING ((select auth.uid()) = user_id);

-- segment_activities は **UPDATE を持たない**。両列が PK を構成しており、
-- メンバーの変更は「消して入れ直す」以外に意味を持たないため、更新経路を作らない。
CREATE POLICY "Users can view own segment_activities" ON public.segment_activities
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own segment_activities" ON public.segment_activities
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own segment_activities" ON public.segment_activities
  FOR DELETE USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 4. GRANT
-- =============================================================================

-- **REVOKE を先に打つ。** production の pg_default_acl は新規 public テーブルへ
-- anon / authenticated に arwdDxtm を既定付与するが、local / Preview は Dxtm のみ。
-- つまり GRANT だけ書くと production にだけ過剰権限が残る。とくに TRUNCATE は
-- RLS で制御できないため、明示的に剥がさないと RLS を素通りしてテーブルを空にできる。
-- 実際に 6 テーブルで発生し 20260810085344（#1715）で剥がした前例がある。
-- 同 epic の 20260818120000（categories / activities）と同じ形を踏襲する。
REVOKE ALL ON TABLE public.segments, public.segment_activities
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.segments
  TO authenticated;

-- segment_activities に UPDATE を与えない（policy を作っていないのと対）。
GRANT SELECT, INSERT, DELETE
  ON TABLE public.segment_activities
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.segments
  TO service_role;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.segment_activities
  TO service_role;

-- =============================================================================
-- 5. Privilege invariants
-- =============================================================================

DO $$
DECLARE
  new_tables TEXT[] := ARRAY['public.segments', 'public.segment_activities'];
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
  END LOOP;

  -- segments は DML 4 種すべて。カンマ区切りは OR 判定になるので 1 つずつ呼ぶ。
  FOREACH privilege IN ARRAY dml_privileges LOOP
    IF NOT has_table_privilege('authenticated', 'public.segments', privilege) THEN
      RAISE EXCEPTION 'authenticated is missing % on public.segments', privilege;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.segments', privilege) THEN
      RAISE EXCEPTION 'service_role is missing % on public.segments', privilege;
    END IF;
  END LOOP;

  -- segment_activities は UPDATE を持たない（メンバーは消して入れ直す）。
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.segment_activities', privilege) THEN
      RAISE EXCEPTION 'authenticated is missing % on public.segment_activities', privilege;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.segment_activities', privilege) THEN
      RAISE EXCEPTION 'service_role is missing % on public.segment_activities', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.segment_activities', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not hold UPDATE on public.segment_activities';
  END IF;
END;
$$;

-- =============================================================================
-- 6. updated_at
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.segments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

COMMIT;
