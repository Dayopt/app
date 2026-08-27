-- #2433（台帳 第2段）: Undo substrate のテーブルを敷く（**構造のみ。RPC は第3段**）。
--
-- 凍結契約 T4（docs/projects/time-ledger-redesign/step-1-technical-contract-freeze.md）が
-- 定める Undo receipt の形をそのまま正規化する:
--
--   「1 つの Undo 可能操作を『複数 resource × フィールド単位の before/after image』の
--     集合として記録する」
--
-- したがって 3 階層になる:
--   undo_receipts             … 1 操作
--   undo_receipt_effects      … 操作が触れた resource（Plan / Record）1 件
--   undo_receipt_field_changes… その resource で変更されたフィールド 1 つ
--
-- **T4 訂正（#2443、2026-08-27 指揮台確定）を反映済み。** 訂正前の T4 は「field mask で
-- 戻す」と「対象行が変更されていたら all-or-nothing で失敗」を同時に書いており両立して
-- いなかった。採用された訂正は **(a) CAS の判定対象を mask 内のフィールドに限定する**。
-- その帰結として、**このテーブル群は行単位の版列（`updated_at` を控える列）を持たない**:
--
--   CAS anchor は `undo_receipt_field_changes.after_value`（= 元操作が書いた値）が兼ねる。
--   Undo 実行時は「mask 内の各フィールドの現在値 == after_value」を確認する。
--   行単位の版列をここに置くと、実装が行単位 CAS へ引き戻されて T4 の矛盾が schema の
--   形で復活する（docs だけ直して schema に残すと再発する、という指摘に基づき明示的に
--   持たせない）。
--
-- Codex B の攻撃シナリオ（#2433 コメント issuecomment-5432218386）のうち本 migration が
-- 構造で塞ぐのは 1・2、および 3 の構造半分:
--
--   1. 新規 public テーブルの RLS / GRANT 片落ち
--      → ENABLE RLS・REVOKE・GRANT・権限不変条件を**この 1 ファイルの中**に置く
--   2. receipt → effect → resource を単一 ID FK だけで結ぶ
--      → resource を polymorphic な単一 `resource_id` にせず、型ごとに列を分けて
--        `(plan_id, user_id)` / `(record_id, user_id)` の複合 FK を実際に張る
--   3.（構造半分）元操作の authority と receipt tenant の非束縛
--      → `origin_connection_id` も `(id, user_id)` で複合束縛する。apply 時の再照合は第3段
--
-- **本段でやらないこと**（第3段 = シナリオ 4〜6）: Undo RPC 本体、TTL の具体値、
-- field mask の allowlist、権限交差の判定、TTL / revoke の transaction 内再検証。
--
-- expand-only: 新規テーブルの追加のみ。既存テーブルの列・意味・データは変えない
-- （唯一の既存オブジェクト変更は末尾の purge 関数で、これも「消し漏れを増やさない」ための
-- 追加であって挙動の縮小ではない）。
--
-- 依存: 20260826234713（`plans` / `records` / `oauth_connections` の複合 FK anchor）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. undo_receipts（1 操作 = 1 行）
-- =============================================================================

CREATE TABLE public.undo_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- T3 の domain command 冪等性キー。同一 operation の再送で receipt を二重に作らない。
  operation_id UUID NOT NULL,
  -- どの command が作った receipt か（`records.trim` 等）。表示にも監査にも要る。
  command_name TEXT NOT NULL,
  -- 元操作の authority の出所。UI 由来の操作では NULL（大半がこれ）。
  origin_connection_id UUID,
  -- **DEFAULT を置かない。** T4 は「TTL は監査保持期間より短い独立した値」という構造だけを
  -- 凍結し、具体的な時間数は UX の実装判断として第3段へ委ねている。ここで既定値を置くと
  -- 委ねたはずの判断を schema が先に決めてしまう。
  undo_expires_at TIMESTAMPTZ NOT NULL,
  undone_at TIMESTAMPTZ,
  undone_operation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT undo_receipts_id_user_id_unique UNIQUE (id, user_id),
  CONSTRAINT undo_receipts_user_id_operation_id_unique UNIQUE (user_id, operation_id),
  CONSTRAINT undo_receipts_command_name_not_blank CHECK (length(btrim(command_name)) > 0),
  -- 「Undo 済み」は 2 列で表すので、片方だけ立った中途半端な状態を作らせない。
  CONSTRAINT undo_receipts_undone_pair
    CHECK ((undone_at IS NULL) = (undone_operation_id IS NULL)),
  -- 単一 FK にしない（シナリオ 3 の構造半分）。列指定 SET NULL（PG 15+）を使い、
  -- connection が消えても receipt は残し `user_id`（NOT NULL）を巻き込まない。
  CONSTRAINT undo_receipts_origin_connection_owner_fkey
    FOREIGN KEY (origin_connection_id, user_id)
    REFERENCES public.oauth_connections (id, user_id)
    ON DELETE SET NULL (origin_connection_id)
);

-- TTL 掃除（第3段の cleanup が「まだ Undo されていない期限切れ」を引く）。
CREATE INDEX undo_receipts_pending_expiry_idx
  ON public.undo_receipts (undo_expires_at)
  WHERE undone_at IS NULL;

-- 親（oauth_connections）の削除時に SET NULL 対象を引くための索引。
-- 複合 FK の子側は索引が無いと親削除のたびに全走査になる。
CREATE INDEX undo_receipts_origin_connection_idx
  ON public.undo_receipts (origin_connection_id, user_id)
  WHERE origin_connection_id IS NOT NULL;

-- =============================================================================
-- 2. undo_receipt_effects（receipt × resource）
-- =============================================================================

CREATE TABLE public.undo_receipt_effects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL,

  -- **polymorphic な単一 `resource_id` にしない。** これがシナリオ 2 の本体。
  -- 単一列では「その ID が存在すること」しか証明できず、他人の resource を自分の receipt へ
  -- 混ぜられる。型ごとに列を分けることで、所有者込みの複合 FK を実際に張れる。
  plan_id UUID,
  record_id UUID,

  -- 派生列。手で矛盾させられない。
  -- 3 種類目の resource を足す時は、この式・下の CHECK・新しい複合 FK・partial UNIQUE を
  -- まとめて変える必要がある（生成列は式を変えられないため DROP + ADD になる）。
  -- Plan と Record は台帳の 2 資源そのものなので 3 種類目は大きなモデル変更を伴い、
  -- その時に一緒に触るのが自然と判断してこの形にした。
  resource_type TEXT GENERATED ALWAYS AS (
    CASE WHEN plan_id IS NOT NULL THEN 'plan' ELSE 'record' END
  ) STORED,

  -- 「行が無かった」と「列が NULL だった」を区別する。これが無いと、作成操作の Undo が
  -- 「行を消す」ではなく「全列を NULL にする」になる。
  effect_kind TEXT NOT NULL,

  CONSTRAINT undo_receipt_effects_id_user_id_unique UNIQUE (id, user_id),
  CONSTRAINT undo_receipt_effects_exactly_one_resource
    CHECK (num_nonnulls(plan_id, record_id) = 1),
  CONSTRAINT undo_receipt_effects_effect_kind_valid
    CHECK (effect_kind IN ('insert', 'update', 'delete')),
  CONSTRAINT undo_receipt_effects_receipt_owner_fkey
    FOREIGN KEY (receipt_id, user_id)
    REFERENCES public.undo_receipts (id, user_id) ON DELETE CASCADE,
  CONSTRAINT undo_receipt_effects_plan_owner_fkey
    FOREIGN KEY (plan_id, user_id)
    REFERENCES public.plans (id, user_id) ON DELETE CASCADE,
  CONSTRAINT undo_receipt_effects_record_owner_fkey
    FOREIGN KEY (record_id, user_id)
    REFERENCES public.records (id, user_id) ON DELETE CASCADE,
  -- 同一 receipt が同じ resource を 2 回含まない。NULL 同士は distinct 扱いなので、
  -- 「record だけの effect が同一 receipt に複数ある」（plan_id が全部 NULL）は通る。
  CONSTRAINT undo_receipt_effects_receipt_plan_unique UNIQUE (receipt_id, plan_id),
  CONSTRAINT undo_receipt_effects_receipt_record_unique UNIQUE (receipt_id, record_id)
);

-- 複合 FK の子側索引（親 Plan / Record の物理削除時に引かれる）。
CREATE INDEX undo_receipt_effects_plan_idx
  ON public.undo_receipt_effects (plan_id, user_id)
  WHERE plan_id IS NOT NULL;
CREATE INDEX undo_receipt_effects_record_idx
  ON public.undo_receipt_effects (record_id, user_id)
  WHERE record_id IS NOT NULL;

-- =============================================================================
-- 3. undo_receipt_field_changes（effect × field）
-- =============================================================================

CREATE TABLE public.undo_receipt_field_changes (
  effect_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,

  -- **JSONB かつ NOT NULL。** SQL の NULL は JSON の `null` で表す。列を nullable に
  -- すると「その列に触れていない」と「値が NULL だった」が区別できなくなり、
  -- field mask の意味が壊れる。
  before_value JSONB NOT NULL,
  -- 元操作が書いた値。**T4 訂正 (a) の CAS anchor はこれ。** Undo 実行時に
  -- 「現在値 == after_value」を確認し、一致しなければその field は他者が正当に変更した
  -- ものとして Undo を失敗させる（mask 外の変更は妨げない）。
  after_value JSONB NOT NULL,

  -- 代理キーを持たせない（`segment_activities` と同じ判断。参照する側がいない）。
  CONSTRAINT undo_receipt_field_changes_pkey PRIMARY KEY (effect_id, field_name),
  CONSTRAINT undo_receipt_field_changes_field_name_not_blank
    CHECK (length(btrim(field_name)) > 0),
  CONSTRAINT undo_receipt_field_changes_effect_owner_fkey
    FOREIGN KEY (effect_id, user_id)
    REFERENCES public.undo_receipt_effects (id, user_id) ON DELETE CASCADE
);

-- `field_name` の allowlist CHECK は**第3段で足す**（シナリオ 6）。`user_id` / `id` 等の
-- 所有権列を復元対象に含められないようにする制約だが、許可すべき列の集合は Undo RPC の
-- 設計と一体。本段で行が 0 件のうちは後から CHECK を足すのが完全に安全（既存行の再検査が
-- 発生しない）ので、RPC と同じ PR で入れるほうが正しい。

-- =============================================================================
-- 4. RLS
-- =============================================================================

ALTER TABLE public.undo_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.undo_receipt_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.undo_receipt_field_changes ENABLE ROW LEVEL SECURITY;

-- owner-scoped の SELECT policy だけを作る。INSERT / UPDATE / DELETE の policy は作らない
-- （書き込みは第3段の typed SECURITY DEFINER RPC 専用にする）。
CREATE POLICY "Users can view own undo_receipts" ON public.undo_receipts
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can view own undo_receipt_effects" ON public.undo_receipt_effects
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can view own undo_receipt_field_changes" ON public.undo_receipt_field_changes
  FOR SELECT USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 5. GRANT
-- =============================================================================

-- **REVOKE を先に打つ。** production の pg_default_acl は新規 public テーブルへ
-- anon / authenticated に arwdDxtm を既定付与するが、local / Preview は Dxtm のみ。
-- GRANT だけ書くと production にだけ過剰権限が残る。とくに TRUNCATE は RLS で制御
-- できないため、明示的に剥がさないと RLS を素通りしてテーブルを空にできる
-- （6 テーブルで実発生し 20260810085344 で剥がした前例がある）。
REVOKE ALL ON TABLE
  public.undo_receipts,
  public.undo_receipt_effects,
  public.undo_receipt_field_changes
  FROM PUBLIC, anon, authenticated;

-- **`authenticated` へは何も GRANT しない（本段では読みも開けない）。**
--
-- 上の SELECT policy は「開ける時の形」を確定させるために先に置くが、GRANT は出さない。
-- 理由: `supabase/config.toml` の `schemas = ["public", ...]` により public schema は
-- PostgREST から自動公開される。SELECT を与えた瞬間、行が 0 件でも列の形
-- （`resource_type` の値域、`effect_kind` の enum、`before_value` / `after_value` の
-- JSONB 構造）が実運用中の read 契約として確定する。第3段の RPC 設計が固まる前に
-- それを出すと、「schema は additive で戻せる」が「公開した形は戻せない」へすり替わる。
--
-- 現時点で読み手は 1 つも無い。開放は第3段が receipt を UI へ出す時に GRANT 1 行を足す
-- だけで済む（additive）。逆に一度開けたものを閉じるのは契約の後退になる。
-- 「不可逆だけ遅く、可逆は速く」の適用。
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.undo_receipts,
  public.undo_receipt_effects,
  public.undo_receipt_field_changes
  TO service_role;

-- =============================================================================
-- 6. 権限不変条件
-- =============================================================================

DO $$
DECLARE
  new_tables TEXT[] := ARRAY[
    'public.undo_receipts',
    'public.undo_receipt_effects',
    'public.undo_receipt_field_changes'
  ];
  dml_privileges TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  target_table TEXT;
  privilege TEXT;
BEGIN
  FOREACH target_table IN ARRAY new_tables LOOP
    -- anon / authenticated は DML を 1 つも持たない。本段は read も開けないので
    -- authenticated も SELECT を含めて 0 でなければならない。
    FOREACH privilege IN ARRAY dml_privileges LOOP
      IF has_table_privilege('anon', target_table, privilege) THEN
        RAISE EXCEPTION 'anon must not hold % on %', privilege, target_table
          USING ERRCODE = '42501';
      END IF;
      IF has_table_privilege('authenticated', target_table, privilege) THEN
        RAISE EXCEPTION
          'authenticated must not hold % on % in stage 2 (reads open in stage 3)',
          privilege, target_table
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

    -- TRUNCATE は RLS で制御できないため、両ロールから明示的に否定する。
    IF has_table_privilege('anon', target_table, 'TRUNCATE')
      OR has_table_privilege('authenticated', target_table, 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'browser roles must not hold TRUNCATE on %', target_table
        USING ERRCODE = '42501';
    END IF;

    -- service_role は 4 種すべて持つ（第3段の RPC が使う）。
    -- カンマ区切りは OR 判定になるので 1 つずつ呼ぶ。
    FOREACH privilege IN ARRAY dml_privileges LOOP
      IF NOT has_table_privilege('service_role', target_table, privilege) THEN
        RAISE EXCEPTION 'service_role is missing % on %', privilege, target_table
          USING ERRCODE = '42501';
      END IF;
    END LOOP;

    -- RLS が有効であること（policy があっても RLS が無効なら素通りする）。
    IF NOT (
      SELECT relation.relrowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid = target_table::REGCLASS
    ) THEN
      RAISE EXCEPTION 'row level security is not enabled on %', target_table
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;

-- purge（account-preserving purge への追加）は次の migration
-- 20260826235012_repair_user_data_purge_enumeration.sql が扱う。
-- 新規テーブルの追加と既存 purge の消し漏れ修正（#2444）は risk profile が違うため
-- 同じ CREATE OR REPLACE に混ぜず、file を分けてレビューしやすくする。

COMMIT;
