-- 繰り返しエントリ分割を単一トランザクションで実行するRPC関数
-- 非アトミックな4段階操作（親更新→新規作成→タグコピー）をトランザクションで保護

CREATE OR REPLACE FUNCTION public.split_recurrence(
  p_user_id UUID,
  p_entry_id UUID,
  p_split_date DATE,
  p_new_start_time TIMESTAMPTZ DEFAULT NULL,
  p_new_end_time TIMESTAMPTZ DEFAULT NULL,
  p_new_title TEXT DEFAULT NULL,
  p_new_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent RECORD;
  v_new_entry_id UUID;
  v_end_date_for_parent DATE;
  v_final_start TIMESTAMPTZ;
  v_final_end TIMESTAMPTZ;
  v_original_start TIMESTAMPTZ;
  v_original_end TIMESTAMPTZ;
BEGIN
  -- 認可チェック
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  -- 1. 親エントリ取得 + ロック
  SELECT * INTO v_parent
  FROM entries
  WHERE id = p_entry_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_parent.recurrence_type IS NULL OR v_parent.recurrence_type = 'none' THEN
    RAISE EXCEPTION 'Entry is not a recurring entry' USING ERRCODE = 'P0001';
  END IF;

  -- 2. 親エントリの recurrence_end_date を前日に設定
  v_end_date_for_parent := p_split_date - INTERVAL '1 day';

  UPDATE entries
  SET recurrence_end_date = v_end_date_for_parent::TEXT,
      updated_at = now()
  WHERE id = p_entry_id AND user_id = p_user_id;

  -- 3. 新エントリの時間計算
  IF v_parent.start_time IS NOT NULL THEN
    v_original_start := v_parent.start_time;
    v_final_start := COALESCE(
      p_new_start_time,
      p_split_date + v_original_start::TIME
    );
  END IF;

  IF v_parent.end_time IS NOT NULL THEN
    v_original_end := v_parent.end_time;
    v_final_end := COALESCE(
      p_new_end_time,
      p_split_date + v_original_end::TIME
    );
  END IF;

  -- 4. 新しい繰り返しエントリ作成
  INSERT INTO entries (
    user_id, title, description, origin,
    start_time, end_time,
    recurrence_type, recurrence_rule, recurrence_end_date,
    reminder_minutes
  ) VALUES (
    p_user_id,
    COALESCE(p_new_title, v_parent.title),
    CASE
      WHEN p_new_description IS NOT NULL THEN p_new_description
      ELSE v_parent.description
    END,
    'planned',
    v_final_start,
    v_final_end,
    v_parent.recurrence_type,
    v_parent.recurrence_rule,
    v_parent.recurrence_end_date,
    v_parent.reminder_minutes
  )
  RETURNING id INTO v_new_entry_id;

  -- 5. 親エントリのタグを新エントリにコピー
  INSERT INTO entry_tags (user_id, entry_id, tag_id)
  SELECT p_user_id, v_new_entry_id, tag_id
  FROM entry_tags
  WHERE entry_id = p_entry_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'parentEntryId', p_entry_id,
    'newEntryId', v_new_entry_id,
    'splitDate', p_split_date
  );
END;
$$;
