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
-- 依存: activities テーブル（Step 1、レーン E）。本 migration はそれより後に適用される。

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

CREATE POLICY "Users can view own segment_activities" ON public.segment_activities
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own segment_activities" ON public.segment_activities
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own segment_activities" ON public.segment_activities
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own segment_activities" ON public.segment_activities
  FOR DELETE USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 4. GRANT
-- =============================================================================

-- anon には与えない。tags は baseline で anon へ過剰付与され 20260810085344 で
-- 剥がされた経緯があるので、最初から authenticated / service_role だけにする。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.segment_activities TO authenticated;
GRANT ALL ON public.segments TO service_role;
GRANT ALL ON public.segment_activities TO service_role;

-- =============================================================================
-- 5. updated_at
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.segments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

COMMIT;
