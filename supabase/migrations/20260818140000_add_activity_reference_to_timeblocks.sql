-- Step 3 (H1): plans / records の activity 参照と、コマンド RPC の additive 拡張。
--
-- 手段の正本: docs/projects/tag-model-replacement/overview.md §9（レーン H の実測反証により改訂）。
--   `CREATE OR REPLACE` で引数を足すと REPLACE されず overload になり、旧バンドルの
--   named-arg 呼び出しが `is not unique` で全滅する。よって「厳密シグネチャ DROP →
--   CREATE」にする。DROP は ACL と関数レベル SET 句（lock_timeout / statement_timeout）
--   を道連れにするため、本 migration の末尾で両方を再適用する。
--
-- tag_id は残す（併存）。撤去は Step 8。

-- ---------------------------------------------------------------------------
-- 1. 参照列 + 複合 FK + index
--
-- 所有者整合は宣言的な複合 FK で担保する（トリガーを 1 本も足さない）。
-- 列指定 ON DELETE SET NULL が要るのは、列を指定しないと user_id まで NULL に
-- しようとして NOT NULL 違反になるため（PG 15+ の構文、本環境は PG 17）。
--
-- index を UNIQUE にしないこと: 一意制約に activity_id が入ると、activity 削除時の
-- SET NULL が既存行と衝突して「そのアクティビティを二度と削除できない」状態を作る
-- （E1 が未分類 UNIQUE で踏んだのと同じバグ class）。
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans
  ADD COLUMN activity_id uuid,
  ADD CONSTRAINT plans_activity_owner_fkey
    FOREIGN KEY (activity_id, user_id)
    REFERENCES public.activities (id, user_id)
    ON DELETE SET NULL (activity_id);

ALTER TABLE public.records
  ADD COLUMN activity_id uuid,
  ADD CONSTRAINT records_activity_owner_fkey
    FOREIGN KEY (activity_id, user_id)
    REFERENCES public.activities (id, user_id)
    ON DELETE SET NULL (activity_id);

CREATE INDEX plans_user_activity_idx ON public.plans (user_id, activity_id)
  WHERE deleted_at IS NULL AND activity_id IS NOT NULL;

CREATE INDEX records_user_activity_idx ON public.records (user_id, activity_id)
  WHERE deleted_at IS NULL AND activity_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. assert_active_timeblock_activity_v1（新設）
--
-- assert_active_timeblock_tag_v1 は触らない（設計 §4-9）。エラーコードを DT001 /
-- DT014 に揃えることで TS 側の error mapping を変更せずに済ませる。
-- activities に is_active は無い（状態は「通常 / アーカイブ」の 2 つだけ）。
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.assert_active_timeblock_activity_v1(
  p_user_id uuid,
  p_activity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_archived_at TIMESTAMPTZ;
BEGIN
  IF p_activity_id IS NULL THEN
    RETURN;
  END IF;

  -- FOR SHARE は tag 版の挙動をそのまま移植する。command のトランザクション内で
  -- 対象行をロックし、この検証の後にアーカイブが commit される窓を閉じる。
  SELECT activity.archived_at
  INTO v_archived_at
  FROM public.activities AS activity
  WHERE activity.id = p_activity_id
    AND activity.user_id = p_user_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Activity not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Activity is archived' USING ERRCODE = 'DT014';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_active_timeblock_activity_v1(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_active_timeblock_activity_v1(uuid, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. private 実体（DROP → CREATE）
--
-- IF EXISTS は付けない。想定シグネチャが無いなら止まるべき（fail closed）で、
-- 黙って新規作成に倒れると overload を作って旧バンドルを壊す経路に戻る。
--
-- ★ update 系に p_activity_id_present を足す理由:
--   update は full-replace セマンティクスで、TS 層が read-then-write（未指定なら
--   既存値を渡す）で契約を満たしている。しかし旧バンドルは activity_id の存在を
--   知らないため既存値を渡せず、DEFAULT NULL がそのまま UPDATE に載って
--   **付与済みの activity_id を黙って消す**。present=false を「触らない」と解釈
--   することで、旧バンドルの更新を構造的に非破壊にする。
--   （create 系には保存すべき既存値が無いので present は不要。）
-- ---------------------------------------------------------------------------

DROP FUNCTION private.create_plan_unserialized_v1(
  uuid, text, text, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION private.create_plan_unserialized_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL
)
RETURNS SETOF plans
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  PERFORM public.assert_active_timeblock_activity_v1(p_user_id, p_activity_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );

  IF p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.plans (
    user_id, title, note, tag_id, activity_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_activity_id, p_external_calendar_event_id,
    p_source, p_start_at, p_end_at
  )
  RETURNING public.plans.*;
END;
$function$;

DROP FUNCTION private.update_plan_unserialized_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION private.update_plan_unserialized_v1(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false
)
RETURNS SETOF plans
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_next_activity_id uuid;
BEGIN
  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  -- present=false は「触らない」。旧バンドルの更新で activity_id を消さないための要。
  v_next_activity_id := CASE
    WHEN p_activity_id_present THEN p_activity_id
    ELSE v_plan.activity_id
  END;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF p_tag_id IS DISTINCT FROM v_plan.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
  -- tag 側と同じ非対称を維持する: 変わらないなら再検証しない。
  IF v_next_activity_id IS DISTINCT FROM v_plan.activity_id THEN
    PERFORM public.assert_active_timeblock_activity_v1(p_user_id, v_next_activity_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_plan.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;
  IF ((v_plan.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  IF ROW(
    p_title, p_note, p_tag_id, v_next_activity_id,
    p_external_calendar_event_id, p_start_at, p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_plan.title,
    v_plan.note,
    v_plan.tag_id,
    v_plan.activity_id,
    v_plan.external_calendar_event_id,
    v_plan.start_at,
    v_plan.end_at
  ) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET title = p_title,
      note = p_note,
      tag_id = p_tag_id,
      activity_id = v_next_activity_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$function$;

DROP FUNCTION private.create_record_unserialized_v1(
  uuid, text, text, uuid, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION private.create_record_unserialized_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL
)
RETURNS SETOF records
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  PERFORM public.assert_active_timeblock_activity_v1(p_user_id, p_activity_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );
  IF p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  IF p_source IS NULL
    OR p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, tag_id, activity_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_activity_id, p_plan_id,
    p_external_calendar_event_id, p_source, p_start_at, p_end_at
  )
  RETURNING public.records.*;
END;
$function$;

DROP FUNCTION private.update_record_unserialized_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid, uuid,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION private.update_record_unserialized_v1(
  p_user_id uuid,
  p_record_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false
)
RETURNS SETOF records
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_record public.records%ROWTYPE;
  v_next_activity_id uuid;
BEGIN
  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;
  IF v_record.source = 'from_plan' AND p_plan_id IS NULL THEN
    RAISE EXCEPTION 'from_plan Record requires a Plan' USING ERRCODE = 'DT012';
  END IF;
  IF ((v_record.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  -- present=false は「触らない」（旧バンドルの更新で activity_id を消さない）。
  v_next_activity_id := CASE
    WHEN p_activity_id_present THEN p_activity_id
    ELSE v_record.activity_id
  END;

  IF p_plan_id IS DISTINCT FROM v_record.plan_id AND p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF p_tag_id IS DISTINCT FROM v_record.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
  IF v_next_activity_id IS DISTINCT FROM v_record.activity_id THEN
    PERFORM public.assert_active_timeblock_activity_v1(p_user_id, v_next_activity_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_record.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;

  IF ROW(
    p_title,
    p_note,
    p_tag_id,
    v_next_activity_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_record.title,
    v_record.note,
    v_record.tag_id,
    v_record.activity_id,
    v_record.plan_id,
    v_record.external_calendar_event_id,
    v_record.start_at,
    v_record.end_at
  ) THEN
    RETURN NEXT v_record;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET title = p_title,
      note = p_note,
      tag_id = p_tag_id,
      activity_id = v_next_activity_id,
      plan_id = p_plan_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.records.*;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Plan -> Record 変換のコピー経路（CREATE OR REPLACE、DROP しない）
--
-- ★ コピーの実体は public.record_plan_command_v1（tag に触れない純粋な wrapper）
--   ではなく、この private 実体。wrapper を直しても activity_id は 1 行も伝わらない。
--   シグネチャ不変なので CREATE OR REPLACE で足り、ACL / timeout は保持される。
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.record_plan_unserialized_v1(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_updated_at timestamp with time zone
)
RETURNS SETOF records
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  v_plan := public.lock_recordable_plan_v1(p_user_id, p_plan_id);

  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, tag_id, activity_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id,
    v_plan.title,
    v_plan.note,
    v_plan.tag_id,
    v_plan.activity_id,
    v_plan.id,
    NULL,
    'from_plan',
    v_plan.start_at,
    v_plan.end_at
  )
  RETURNING public.records.*;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. public wrapper（DROP → CREATE）
--
-- ★ wrapper → private の呼び出しは位置引数。新引数を wrapper のシグネチャに足す
--   だけで private への呼び出しを直し忘れると、DEFAULT が黙って NULL を埋めて
--   activity_id が永久に伝わらない（呼び出しは成功するのでエラーで気づけない）。
--   実測で確認済みの罠なので、下の呼び出しは必ず新引数まで渡すこと。
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_plan_command_v1(
  uuid, text, text, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.create_plan_command_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL
)
RETURNS SETOF plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_plan_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_tag_id,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at,
    p_activity_id
  ) AS implementation;
END;
$function$;

DROP FUNCTION public.update_plan_command_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.update_plan_command_v1(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false
)
RETURNS SETOF plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_tag_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_activity_id_present
  ) AS implementation;
END;
$function$;

DROP FUNCTION public.create_record_command_v1(
  uuid, text, text, uuid, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.create_record_command_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL
)
RETURNS SETOF records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_record_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at,
    p_activity_id
  ) AS implementation;
END;
$function$;

DROP FUNCTION public.update_record_command_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid, uuid,
  timestamp with time zone, timestamp with time zone);

CREATE FUNCTION public.update_record_command_v1(
  p_user_id uuid,
  p_record_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false
)
RETURNS SETOF records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_record_unserialized_v1(
    p_user_id,
    p_record_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_tag_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_activity_id_present
  ) AS implementation;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. DROP で失われた属性の復元（必須）
--
-- 値は pg_proc の実測から取っている（migration 履歴からの転記はしない。履歴は
-- 後続 migration に上書きされうるため）。
--   - ACL     : DROP で PUBLIC 既定へ戻る = 20260604230607 の hardening が巻き戻る
--   - SET 句  : lock_timeout / statement_timeout は別 ALTER FUNCTION 由来のため
--               DROP で消える = ロック待ち / 長時間クエリの上限が外れる
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  SET statement_timeout TO '30s';

REVOKE ALL ON FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  TO service_role;

REVOKE ALL ON FUNCTION private.create_plan_unserialized_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_plan_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.create_record_unserialized_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_record_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
