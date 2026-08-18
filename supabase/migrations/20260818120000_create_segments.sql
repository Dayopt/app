-- #2162 Step 5: セグメント（分析用の保存されたクエリ）を追加する。
--
-- 3 構造モデル（アクティビティ / カテゴリー / セグメント）のうち、セグメントだけが
-- 「所属」ではなく「横断参照」を担う。カテゴリーとアクティビティが分割（重複なし）で
-- 合計の足し算が合うのに対し、**セグメントは重複しうる**。この違いが schema にも出る:
-- segment_activities は多対多で、1 アクティビティが複数セグメントに入ってよい。
--
-- 設計上、セグメントに保存させるのは**アクティビティの集合だけ**とする（#2162 の凍結契約）。
-- 期間・指標・グルーピング・並べ替えを持たせない。これは principles.md §右サイドパネル の
-- 「カスタムレポート・期間指定の複雑なフィルタは足さない（Toggl / RescueTime の領土）」を
-- schema 側で担保するためで、列を足さないこと自体が制約として機能する。
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
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- segment_activities からの複合 FK 参照先
  CONSTRAINT segments_id_user_id_unique UNIQUE (id, user_id),
  CONSTRAINT segments_name_not_blank CHECK (btrim(name) <> '')
);

-- アクティブなセグメント内での名前重複だけを禁止する（アーカイブ済みは同名を許す）。
-- categories / activities と同じ部分 UNIQUE の形。
CREATE UNIQUE INDEX segments_user_id_name_active_unique
  ON public.segments (user_id, name)
  WHERE archived_at IS NULL;

-- =============================================================================
-- 2. segment_activities（多対多。セグメントが重複しうることの実体）
-- =============================================================================

CREATE TABLE public.segment_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL,
  activity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 同じアクティビティを同じセグメントへ二重登録させない
  CONSTRAINT segment_activities_segment_activity_unique UNIQUE (segment_id, activity_id),
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

-- 「このセグメントに入っているアクティビティ」の引き当て（集計の主経路）
CREATE INDEX segment_activities_segment_id_idx
  ON public.segment_activities (segment_id);

-- 「このアクティビティが属するセグメント」の逆引き（アクティビティ削除時の影響確認）
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
