-- Auto-record model（自動記録モデル）
--
-- 製品方針: 予定が過去になったら自動で記録になる（記録の手間ゼロ）。
-- データ表現:
-- - actual_start_time / actual_end_time は「ユーザーが編集・確定した実績」のみを保持（NULL = 未編集）
-- - 過去になった planned エントリは読み取り時に plan range を実績として扱う（effective actual、cron 不要）
-- - skipped_at で「計画したがやらなかった」を表現（実績集計から除外、計画履歴は残る）
--
-- effective actual の定義（このファイルの entries_effective view が唯一の正）:
--   actual が両方 NOT NULL → その値
--   planned かつ skipped_at IS NULL かつ end_time <= now() → plan range
--   それ以外（未来の planned / skipped）→ 実績なし（NULL）

-- =============================================================================
-- 1. skipped_at カラム追加
-- =============================================================================

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS skipped_at TIMESTAMPTZ;

COMMENT ON COLUMN public.entries.skipped_at IS
  '計画したがやらなかった planned エントリのマーカー。NULL = スキップしていない。skipped 行は実績集計から除外される。';

-- =============================================================================
-- 2. データクリーンアップ + backfill
-- =============================================================================

-- 2a. 時間順序が壊れている行を soft delete（20260513 の overlap cleanup と同方針。
--     NOT VALID のまま残っていた order 制約を VALIDATE するための前掃除）
UPDATE public.entries
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND start_time IS NOT NULL
  AND end_time IS NOT NULL
  AND end_time <= start_time;

UPDATE public.entries
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL
  AND actual_end_time <= actual_start_time;

-- 2b. shape が壊れている行の修復（20260513 が NOT VALID で先送りした残骸）
--     planned なのに plan range が無い → 実績があれば unplanned として救済、なければ soft delete
UPDATE public.entries
SET origin = 'unplanned', start_time = NULL, end_time = NULL
WHERE deleted_at IS NULL
  AND origin = 'planned'
  AND (start_time IS NULL OR end_time IS NULL)
  AND actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL
  AND actual_end_time <= NOW();

UPDATE public.entries
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND origin = 'planned'
  AND (start_time IS NULL OR end_time IS NULL);

--     unplanned なのに plan range がある / actual range が無い
UPDATE public.entries
SET start_time = NULL, end_time = NULL
WHERE deleted_at IS NULL
  AND origin = 'unplanned'
  AND (start_time IS NOT NULL OR end_time IS NOT NULL)
  AND actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL;

UPDATE public.entries
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND origin = 'unplanned'
  AND (actual_start_time IS NULL OR actual_end_time IS NULL);

--     actual が片方だけの planned 行 → 未編集扱いに正規化
UPDATE public.entries
SET actual_start_time = NULL, actual_end_time = NULL
WHERE deleted_at IS NULL
  AND origin = 'planned'
  AND (actual_start_time IS NULL) <> (actual_end_time IS NULL);

-- 2c. backfill: 20260513 で plan からコピーされた actual を NULL（未編集）へ戻す。
--     plan range と完全一致 = ユーザー未編集とみなす近似。「予定通りと明示確認した」
--     状態は現行プロダクトに存在しないため情報損失ゼロ。
UPDATE public.entries
SET actual_start_time = NULL, actual_end_time = NULL
WHERE origin = 'planned'
  AND actual_start_time IS NOT NULL
  AND actual_end_time IS NOT NULL
  AND actual_start_time = start_time
  AND actual_end_time = end_time;

-- =============================================================================
-- 3. 制約の再定義（actual NULL = 未編集 を許容 / skip の形を強制）
-- =============================================================================

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_actual_time_order;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_two_layer_shape;

ALTER TABLE public.entries
  DROP CONSTRAINT IF EXISTS entries_skip_shape;

-- actual は「両方 NULL（未編集）」か「両方 NOT NULL で end > start」のみ
ALTER TABLE public.entries
  ADD CONSTRAINT entries_actual_time_order
  CHECK (
    deleted_at IS NOT NULL
    OR (actual_start_time IS NULL AND actual_end_time IS NULL)
    OR (
      actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
      AND actual_end_time > actual_start_time
    )
  );

-- planned: plan range 必須 + actual は両方 NULL or 両方 NOT NULL
-- unplanned: plan range NULL + actual 必須
ALTER TABLE public.entries
  ADD CONSTRAINT entries_two_layer_shape
  CHECK (
    deleted_at IS NOT NULL
    OR (
      origin = 'planned'
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND (
        (actual_start_time IS NULL AND actual_end_time IS NULL)
        OR (actual_start_time IS NOT NULL AND actual_end_time IS NOT NULL)
      )
    )
    OR (
      origin = 'unplanned'
      AND start_time IS NULL
      AND end_time IS NULL
      AND actual_start_time IS NOT NULL
      AND actual_end_time IS NOT NULL
    )
  );

-- skip は planned かつ actual 未編集の行にのみ立てられる（スキップと実績は排他）
ALTER TABLE public.entries
  ADD CONSTRAINT entries_skip_shape
  CHECK (
    skipped_at IS NULL
    OR (
      origin = 'planned'
      AND actual_start_time IS NULL
      AND actual_end_time IS NULL
    )
  );

-- 20260513 から NOT VALID のまま残っていた order 制約を validate（2a で前掃除済み）
ALTER TABLE public.entries VALIDATE CONSTRAINT entries_planned_time_order;

-- =============================================================================
-- 4. entries_effective view — effective actual の唯一の定義
-- =============================================================================
-- 統計 RPC はすべてこの view を読む。アプリ側の同義実装は
-- features/entry/domain/entry-time-model.ts の getEffectiveActualRange()。
-- security_invoker = true により呼び出し側の RLS が適用される。

CREATE OR REPLACE VIEW public.entries_effective
WITH (security_invoker = true) AS
SELECT
  e.*,
  COALESCE(
    e.actual_start_time,
    CASE
      WHEN e.origin = 'planned' AND e.skipped_at IS NULL AND e.end_time <= NOW()
      THEN e.start_time
    END
  ) AS effective_start_time,
  COALESCE(
    e.actual_end_time,
    CASE
      WHEN e.origin = 'planned' AND e.skipped_at IS NULL AND e.end_time <= NOW()
      THEN e.end_time
    END
  ) AS effective_end_time
FROM public.entries e
WHERE e.deleted_at IS NULL;

REVOKE ALL ON public.entries_effective FROM PUBLIC;
REVOKE ALL ON public.entries_effective FROM anon;
GRANT SELECT ON public.entries_effective TO authenticated;
GRANT SELECT ON public.entries_effective TO service_role;

-- =============================================================================
-- 5. 統計 RPC を effective actual に統一
-- =============================================================================
-- 効果:
-- - 未実行の予定（未来の planned / skipped）が実績集計に乗らなくなる
-- - unplanned エントリ（start_time NULL）が集計から漏れていた問題も解消される
-- - 見積もり精度系は actual を明示確定した行のみを対象にする
--   （自動記録は精度 100% に見えるノイズのため分母に入れない）

-- 5a. get_tag_cumulative_time
CREATE OR REPLACE FUNCTION public.get_tag_cumulative_time(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_total_minutes DOUBLE PRECISION;
BEGIN
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 60
  ), 0)
  INTO v_total_minutes
  FROM public.entries_effective e
  WHERE e.user_id = p_user_id
    AND e.tag_id = p_tag_id
    AND e.effective_start_time IS NOT NULL
    AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.effective_start_time < p_end_date);

  RETURN json_build_object(
    'totalMinutes', v_total_minutes
  );
END;
$$;

-- 5b. get_tag_avg_fulfillment
CREATE OR REPLACE FUNCTION public.get_tag_avg_fulfillment(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_avg DOUBLE PRECISION;
  v_count BIGINT;
BEGIN
  SELECT
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(e.fulfillment_score)::BIGINT
  INTO v_avg, v_count
  FROM public.entries_effective e
  WHERE e.user_id = p_user_id
    AND e.tag_id = p_tag_id
    AND e.fulfillment_score IS NOT NULL
    AND e.effective_start_time IS NOT NULL
    AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.effective_start_time < p_end_date);

  RETURN json_build_object(
    'avgFulfillment', v_avg,
    'entryCount', v_count
  );
END;
$$;

-- 5c. get_tag_plan_rate（記録のうち事前計画されていた割合。実績ベースに統一）
CREATE OR REPLACE FUNCTION public.get_tag_plan_rate(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_total BIGINT;
  v_planned BIGINT;
BEGIN
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE e.origin = 'planned')::BIGINT
  INTO v_total, v_planned
  FROM public.entries_effective e
  WHERE e.user_id = p_user_id
    AND e.tag_id = p_tag_id
    AND e.effective_start_time IS NOT NULL
    AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
    AND (p_end_date IS NULL OR e.effective_start_time < p_end_date);

  RETURN json_build_object(
    'totalEntries', v_total,
    'plannedEntries', v_planned,
    'planRate', CASE WHEN v_total > 0 THEN (v_planned::DOUBLE PRECISION / v_total) ELSE 0 END
  );
END;
$$;

-- 5d. get_tag_hourly_distribution
CREATE OR REPLACE FUNCTION public.get_tag_hourly_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(hour INT, total_minutes NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM e.effective_start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.effective_start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.effective_start_time <= p_end_date)
    GROUP BY EXTRACT(HOUR FROM e.effective_start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- 5e. get_tag_dow_distribution
CREATE OR REPLACE FUNCTION public.get_tag_dow_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(dow INT, total_minutes NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      EXTRACT(DOW FROM e.effective_start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.effective_start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.effective_start_time <= p_end_date)
    GROUP BY EXTRACT(DOW FROM e.effective_start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1;
END;
$$;

-- 5f. get_child_tag_breakdown（20260424 の parent_id 版を継承）
CREATE OR REPLACE FUNCTION public.get_child_tag_breakdown(
  p_user_id UUID,
  p_parent_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(tag_id UUID, tag_name TEXT, tag_color TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      child.id AS tag_id,
      child.name AS tag_name,
      COALESCE(child.color, 'indigo') AS tag_color,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 60
      ) / 60, 2)::DOUBLE PRECISION AS hours
    FROM public.entries_effective e
    JOIN public.tags child ON child.id = e.tag_id
    WHERE e.user_id = p_user_id
      AND child.parent_id = p_parent_tag_id
      AND e.effective_start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.effective_start_time < p_end_date)
    GROUP BY child.id, child.name, child.color
    ORDER BY hours DESC;
END;
$$;

-- 5g. get_tag_fulfillment_distribution
CREATE OR REPLACE FUNCTION public.get_tag_fulfillment_distribution(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(score INT, count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.fulfillment_score::INT AS score,
      COUNT(*)::BIGINT AS count
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.fulfillment_score IS NOT NULL
      AND e.effective_start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.effective_start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.effective_start_time < p_end_date)
    GROUP BY e.fulfillment_score
    ORDER BY e.fulfillment_score DESC;
END;
$$;

-- 5h. get_tag_accuracy_trend（ユーザーが actual を確定した行のみ。
--     旧版は plan range と duration_minutes（plan range 由来）を比較しており常にほぼ 0 だった）
CREATE OR REPLACE FUNCTION public.get_tag_accuracy_trend(
  p_user_id UUID,
  p_tag_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_bucket TEXT DEFAULT 'week'
)
RETURNS TABLE(bucket TEXT, avg_deviation DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      CASE p_bucket
        WHEN 'week' THEN 'W' || EXTRACT(WEEK FROM e.actual_start_time AT TIME ZONE v_tz)::TEXT
        WHEN 'month' THEN TO_CHAR(e.actual_start_time AT TIME ZONE v_tz, 'YYYY-MM')
        ELSE TO_CHAR(e.actual_start_time AT TIME ZONE v_tz, 'YYYY-MM-DD')
      END AS bucket,
      AVG(
        ABS(EXTRACT(EPOCH FROM (e.actual_end_time - e.actual_start_time)) / 60 - e.duration_minutes)
      )::DOUBLE PRECISION AS avg_deviation,
      COUNT(*)::BIGINT AS entry_count
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.origin = 'planned'
      AND e.actual_start_time IS NOT NULL
      AND e.actual_end_time IS NOT NULL
      AND e.duration_minutes IS NOT NULL
      AND e.duration_minutes > 0
      AND (p_start_date IS NULL OR e.actual_start_time >= p_start_date)
      AND (p_end_date IS NULL OR e.actual_start_time < p_end_date)
    GROUP BY bucket
    ORDER BY MIN(e.actual_start_time);
END;
$$;

-- 5i. get_tag_recent_entries（表示 range は effective actual。未来・skipped は除外）
CREATE OR REPLACE FUNCTION public.get_tag_recent_entries(
  p_user_id UUID,
  p_tag_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  entry_id UUID,
  title TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_minutes DOUBLE PRECISION,
  planned_minutes DOUBLE PRECISION,
  fulfillment_score INT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
    SELECT
      e.id AS entry_id,
      e.title::TEXT,
      e.effective_start_time AS start_time,
      e.effective_end_time AS end_time,
      EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time))::DOUBLE PRECISION / 60
        AS duration_minutes,
      e.duration_minutes::DOUBLE PRECISION AS planned_minutes,
      e.fulfillment_score::INT
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.tag_id = p_tag_id
      AND e.effective_start_time IS NOT NULL
    ORDER BY e.effective_start_time DESC
    LIMIT p_limit;
END;
$$;

-- 5j. get_daily_hours
CREATE OR REPLACE FUNCTION public.get_daily_hours(
  p_user_id UUID,
  p_year INT
)
RETURNS TABLE(day TEXT, hours NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      to_char((e.effective_start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD'),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600
      )::NUMERIC, 2)
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND EXTRACT(YEAR FROM e.effective_start_time AT TIME ZONE v_tz) = p_year
    GROUP BY (e.effective_start_time AT TIME ZONE v_tz)::DATE
    ORDER BY 1;
END;
$$;

-- 5k. get_monthly_hours
CREATE OR REPLACE FUNCTION public.get_monthly_hours(
  p_user_id UUID,
  p_months INT DEFAULT 12
)
RETURNS TABLE(month TEXT, hours NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_start_date TIMESTAMPTZ;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');
  v_start_date := date_trunc('month', now() AT TIME ZONE v_tz) - (p_months - 1 || ' months')::INTERVAL;

  RETURN QUERY
    SELECT
      to_char(date_trunc('month', e.effective_start_time AT TIME ZONE v_tz), 'YYYY-MM'),
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600
      )::NUMERIC, 2)
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= v_start_date
    GROUP BY date_trunc('month', e.effective_start_time AT TIME ZONE v_tz)
    ORDER BY 1;
END;
$$;

-- 5l. get_active_dates
CREATE OR REPLACE FUNCTION public.get_active_dates(
  p_user_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS SETOF DATE
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT DISTINCT (e.effective_start_time AT TIME ZONE v_tz)::DATE
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND (p_start_date IS NULL OR e.effective_start_time >= (p_start_date::timestamp AT TIME ZONE v_tz))
      AND (p_end_date IS NULL   OR e.effective_start_time <  ((p_end_date + 1)::timestamp AT TIME ZONE v_tz))
    ORDER BY 1;
END;
$$;

-- 5m. get_energy_map
CREATE OR REPLACE FUNCTION public.get_energy_map(
  p_user_id UUID,
  p_start DATE,
  p_end DATE
)
RETURNS TABLE(hour INT, dow INT, total_minutes NUMERIC)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM e.effective_start_time AT TIME ZONE v_tz)::INT,
      EXTRACT(DOW FROM e.effective_start_time AT TIME ZONE v_tz)::INT,
      ROUND(SUM(
        EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 60
      )::NUMERIC, 1)
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= (p_start::timestamp AT TIME ZONE v_tz)
      AND e.effective_start_time <  ((p_end + 1)::timestamp AT TIME ZONE v_tz)
    GROUP BY
      EXTRACT(HOUR FROM e.effective_start_time AT TIME ZONE v_tz)::INT,
      EXTRACT(DOW FROM e.effective_start_time AT TIME ZONE v_tz)::INT
    ORDER BY 1, 2;
END;
$$;

-- 5n. get_time_pl_data（Review Time P/L）
-- budget は planned 層（skipped・未来も予算には含む）、actual は effective actual。
CREATE OR REPLACE FUNCTION public.get_time_pl_data(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_prev_start TIMESTAMPTZ DEFAULT NULL,
  p_prev_end TIMESTAMPTZ DEFAULT NULL,
  p_wake_hour INT DEFAULT 7,
  p_sleep_hour INT DEFAULT 23
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_tz TEXT;
  v_result JSON;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  WITH
  base AS (
    SELECT e.*
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND (
        (
          e.effective_start_time IS NOT NULL
          AND e.effective_start_time < p_end_date
          AND e.effective_end_time > p_start_date
        )
        OR (
          e.origin = 'planned'
          AND e.start_time < p_end_date
          AND e.end_time > p_start_date
        )
      )
  ),

  prev AS (
    SELECT e.*
    FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND p_prev_start IS NOT NULL
      AND p_prev_end IS NOT NULL
      AND (
        (
          e.effective_start_time IS NOT NULL
          AND e.effective_start_time < p_prev_end
          AND e.effective_end_time > p_prev_start
        )
        OR (
          e.origin = 'planned'
          AND e.start_time < p_prev_end
          AND e.end_time > p_prev_start
        )
      )
  ),

  tag_pl AS (
    SELECT COALESCE(json_agg(row_data ORDER BY total_actual DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'tagIcon', t.icon,
        'budgetMinutes', ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(COALESCE(SUM(
          CASE WHEN b.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1),
        'isPlanned', BOOL_OR(b.origin = 'planned' AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0)
      ) AS row_data,
      COALESCE(SUM(
        CASE WHEN b.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
             ELSE 0 END
      ), 0) AS total_actual
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING COALESCE(SUM(
        CASE WHEN b.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time))
             ELSE 0 END
      ), 0) > 0
         OR SUM(CASE WHEN b.origin = 'planned' THEN COALESCE(b.duration_minutes, 0) ELSE 0 END) > 0
    ) sub
  ),

  prev_tag_pl AS (
    SELECT COALESCE(json_agg(row_data ORDER BY total_actual DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id,
        'tagName', t.name,
        'tagColor', COALESCE(t.color, 'indigo'),
        'tagIcon', t.icon,
        'budgetMinutes', ROUND(COALESCE(SUM(
          CASE WHEN p.origin = 'planned' AND p.duration_minutes IS NOT NULL
               THEN p.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1),
        'actualMinutes', ROUND(COALESCE(SUM(
          CASE WHEN p.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1),
        'isPlanned', BOOL_OR(p.origin = 'planned' AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0)
      ) AS row_data,
      COALESCE(SUM(
        CASE WHEN p.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60
             ELSE 0 END
      ), 0) AS total_actual
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color, t.icon
      HAVING COALESCE(SUM(
        CASE WHEN p.effective_start_time IS NOT NULL
             THEN EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time))
             ELSE 0 END
      ), 0) > 0
         OR SUM(CASE WHEN p.origin = 'planned' THEN COALESCE(p.duration_minutes, 0) ELSE 0 END) > 0
    ) sub
  ),

  daily_points AS (
    SELECT COALESCE(json_agg(json_build_object(
      'label', TO_CHAR(day, 'MM/DD'),
      'budgetMinutes', COALESCE(budget_min, 0),
      'actualMinutes', COALESCE(actual_min, 0)
    ) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT
        (COALESCE(b.effective_start_time, b.start_time) AT TIME ZONE v_tz)::DATE AS day,
        ROUND(COALESCE(SUM(
          CASE WHEN b.origin = 'planned' AND b.duration_minutes IS NOT NULL
               THEN b.duration_minutes ELSE 0 END
        ), 0)::NUMERIC, 1) AS budget_min,
        ROUND(COALESCE(SUM(
          CASE WHEN b.effective_start_time IS NOT NULL
               THEN EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60
               ELSE 0 END
        ), 0)::NUMERIC, 1) AS actual_min
      FROM base b
      GROUP BY (COALESCE(b.effective_start_time, b.start_time) AT TIME ZONE v_tz)::DATE
    ) sub
  ),

  available AS (
    SELECT
      CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60
        ELSE (p_sleep_hour - p_wake_hour) * 60
      END *
      (DATE_PART('day', (p_end_date AT TIME ZONE v_tz)::DATE - (p_start_date AT TIME ZONE v_tz)::DATE)::INT + 1)
      AS minutes
  )

  SELECT json_build_object(
    'tags', tag_pl.data,
    'prevTags', prev_tag_pl.data,
    'dailyPoints', daily_points.data,
    'availableMinutes', GREATEST(available.minutes, 0)
  ) INTO v_result
  FROM tag_pl, prev_tag_pl, daily_points, available;

  RETURN v_result;
END;
$$;

-- 5o. get_stats_page_data（Stats ページ複合 RPC）
CREATE OR REPLACE FUNCTION public.get_stats_page_data(
  p_user_id UUID,
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_prev_start TIMESTAMPTZ,
  p_prev_end TIMESTAMPTZ,
  p_year INT,
  p_monthly_months INT DEFAULT 3,
  p_wake_hour INT DEFAULT 7,
  p_sleep_hour INT DEFAULT 23
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tz TEXT;
  v_result JSON;
BEGIN
  v_tz := COALESCE(public.get_user_timezone(p_user_id), 'UTC');

  WITH
  base AS (
    SELECT e.* FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= p_start_date AND e.effective_start_time < p_end_date
  ),
  prev AS (
    SELECT e.* FROM public.entries_effective e
    WHERE e.user_id = p_user_id
      AND e.effective_start_time IS NOT NULL
      AND e.effective_start_time >= p_prev_start AND e.effective_start_time < p_prev_end
  ),
  overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0),
      'avgFulfillment', AVG(b.fulfillment_score),
      'entryCount', COUNT(b.fulfillment_score) FILTER (WHERE b.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE b.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE b.origin = 'planned')::DOUBLE PRECISION / COUNT(*) ELSE 0 END
    ) AS data FROM base b
  ),
  prev_overview AS (
    SELECT json_build_object(
      'totalMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60), 0),
      'avgFulfillment', AVG(p.fulfillment_score),
      'entryCount', COUNT(p.fulfillment_score) FILTER (WHERE p.fulfillment_score IS NOT NULL),
      'totalEntries', COUNT(*),
      'plannedEntries', COUNT(*) FILTER (WHERE p.origin = 'planned'),
      'planRate', CASE WHEN COUNT(*) > 0
        THEN COUNT(*) FILTER (WHERE p.origin = 'planned')::DOUBLE PRECISION / COUNT(*) ELSE 0 END
    ) AS data FROM prev p
  ),
  cs_tags AS (
    SELECT b.id, b.effective_start_time,
      (b.effective_start_time AT TIME ZONE v_tz)::DATE AS entry_date, b.tag_id
    FROM base b
  ),
  cs_ordered AS (
    SELECT entry_date, tag_id,
      LAG(tag_id) OVER (PARTITION BY entry_date ORDER BY effective_start_time) AS prev_tag_id
    FROM cs_tags
  ),
  cs_daily AS (
    SELECT entry_date,
      COUNT(*) FILTER (WHERE prev_tag_id IS NOT NULL AND tag_id IS DISTINCT FROM prev_tag_id) AS switches
    FROM cs_ordered GROUP BY entry_date
  ),
  context_switches AS (
    SELECT json_build_object(
      'totalSwitches', COALESCE(SUM(switches), 0),
      'avgPerDay', CASE WHEN COUNT(DISTINCT entry_date) > 0
        THEN COALESCE(SUM(switches), 0)::DOUBLE PRECISION / COUNT(DISTINCT entry_date) ELSE 0 END
    ) AS data FROM cs_daily
  ),
  blank_rate AS (
    SELECT json_build_object(
      'availableMinutes', CASE
        WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
        ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END,
      'scheduledMinutes', COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0),
      'blankRate', CASE
        WHEN CASE
          WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
          ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END > 0 THEN
          GREATEST(0,
            CASE
              WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
              ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END
            - COALESCE(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60), 0)
          )::DOUBLE PRECISION / CASE
            WHEN p_sleep_hour <= p_wake_hour THEN (24 - p_wake_hour + p_sleep_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT
            ELSE (p_sleep_hour - p_wake_hour) * 60 * GREATEST(1, EXTRACT(EPOCH FROM (p_end_date - p_start_date)) / 86400)::INT END
        ELSE 0 END
    ) AS data FROM base b
  ),
  time_by_tag AS (
    SELECT COALESCE(json_agg(row_data ORDER BY hours DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'name', t.name, 'color', COALESCE(t.color, 'indigo'),
        'hours', ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 3600)::NUMERIC, 2)
      ) AS row_data,
      SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 3600) AS hours
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL
      GROUP BY t.id, t.name, t.color
      HAVING SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time))) > 0
    ) sub
  ),
  hourly AS (
    SELECT COALESCE(json_agg(json_build_object('hour', hour, 'totalMinutes', total_minutes) ORDER BY hour), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  dow AS (
    SELECT COALESCE(json_agg(json_build_object('dow', dow, 'totalMinutes', total_minutes) ORDER BY dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        ROUND(SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::NUMERIC, 1) AS total_minutes
      FROM base b GROUP BY EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(b.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (b.effective_end_time - b.effective_start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM base b GROUP BY
        EXTRACT(HOUR FROM b.effective_start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM b.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(b.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (b.actual_end_time - b.actual_start_time)) / 60 - b.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM base b
      JOIN public.tags t ON t.id = b.tag_id
      WHERE b.tag_id IS NOT NULL AND b.origin = 'planned'
        AND b.actual_start_time IS NOT NULL AND b.actual_end_time IS NOT NULL
        AND b.duration_minutes IS NOT NULL AND b.duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_estimation_accuracy AS (
    SELECT COALESCE(json_agg(row_data ORDER BY entry_count DESC), '[]'::JSON) AS data
    FROM (
      SELECT json_build_object(
        'tagId', t.id, 'tagName', t.name, 'tagColor', COALESCE(t.color, 'indigo'),
        'avgPlannedMinutes', AVG(p.duration_minutes),
        'avgActualMinutes', AVG(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60),
        'avgDeviationMinutes', AVG(ABS(EXTRACT(EPOCH FROM (p.actual_end_time - p.actual_start_time)) / 60 - p.duration_minutes)),
        'entryCount', COUNT(*)
      ) AS row_data, COUNT(*) AS entry_count
      FROM prev p
      JOIN public.tags t ON t.id = p.tag_id
      WHERE p.tag_id IS NOT NULL AND p.origin = 'planned'
        AND p.actual_start_time IS NOT NULL AND p.actual_end_time IS NOT NULL
        AND p.duration_minutes IS NOT NULL AND p.duration_minutes > 0
      GROUP BY t.id, t.name, t.color HAVING COUNT(*) >= 2
    ) sub
  ),
  prev_energy_map AS (
    SELECT COALESCE(json_agg(json_build_object(
      'hour', hour, 'dow', dow, 'avgFulfillment', avg_fulfillment,
      'totalMinutes', total_minutes, 'entryCount', entry_count
    ) ORDER BY hour, dow), '[]'::JSON) AS data
    FROM (
      SELECT EXTRACT(HOUR FROM p.effective_start_time AT TIME ZONE v_tz)::INT AS hour,
        EXTRACT(DOW FROM p.effective_start_time AT TIME ZONE v_tz)::INT AS dow,
        AVG(p.fulfillment_score)::DOUBLE PRECISION AS avg_fulfillment,
        SUM(EXTRACT(EPOCH FROM (p.effective_end_time - p.effective_start_time)) / 60)::DOUBLE PRECISION AS total_minutes,
        COUNT(*)::BIGINT AS entry_count
      FROM prev p GROUP BY
        EXTRACT(HOUR FROM p.effective_start_time AT TIME ZONE v_tz)::INT,
        EXTRACT(DOW FROM p.effective_start_time AT TIME ZONE v_tz)::INT
    ) sub
  ),
  daily_hours AS (
    SELECT COALESCE(json_agg(json_build_object('day', day, 'hours', hours) ORDER BY day), '[]'::JSON) AS data
    FROM (
      SELECT to_char((e.effective_start_time AT TIME ZONE v_tz)::DATE, 'YYYY-MM-DD') AS day,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries_effective e
      WHERE e.user_id = p_user_id
        AND e.effective_start_time IS NOT NULL
        AND EXTRACT(YEAR FROM e.effective_start_time AT TIME ZONE v_tz) = p_year
      GROUP BY (e.effective_start_time AT TIME ZONE v_tz)::DATE
    ) sub
  ),
  monthly_trend AS (
    SELECT COALESCE(json_agg(json_build_object('month', month, 'hours', hours) ORDER BY month), '[]'::JSON) AS data
    FROM (
      SELECT to_char(date_trunc('month', e.effective_start_time AT TIME ZONE v_tz), 'YYYY-MM') AS month,
        ROUND(SUM(EXTRACT(EPOCH FROM (e.effective_end_time - e.effective_start_time)) / 3600)::NUMERIC, 2) AS hours
      FROM public.entries_effective e
      WHERE e.user_id = p_user_id
        AND e.effective_start_time IS NOT NULL
        AND e.effective_start_time >= (date_trunc('month', NOW() AT TIME ZONE v_tz) - (p_monthly_months || ' months')::INTERVAL) AT TIME ZONE v_tz
      GROUP BY date_trunc('month', e.effective_start_time AT TIME ZONE v_tz)
    ) sub
  )

  SELECT json_build_object(
    'overview', o.data, 'prevOverview', po.data,
    'contextSwitches', cs.data, 'blankRate', br.data,
    'timeByTag', tbt.data, 'hourly', h.data, 'dow', d.data,
    'energyMap', em.data, 'estimationAccuracy', ea.data,
    'prevEstimationAccuracy', pea.data, 'prevEnergyMap', pem.data,
    'dailyHours', dh.data, 'monthlyTrend', mt.data
  ) INTO v_result
  FROM overview o, prev_overview po, context_switches cs, blank_rate br,
       time_by_tag tbt, hourly h, dow d, energy_map em,
       estimation_accuracy ea, prev_estimation_accuracy pea,
       prev_energy_map pem, daily_hours dh, monthly_trend mt;

  RETURN v_result;
END;
$$;

-- =============================================================================
-- 6. 権限（20260604230607 の harden 方針を維持）
-- =============================================================================
-- CREATE OR REPLACE は既存 GRANT を保持するが、明示的に再付与して意図を残す。

DO $$
DECLARE
  fn text;
  target regprocedure;
  fns text[] := ARRAY[
    'public.get_tag_cumulative_time(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_avg_fulfillment(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_plan_rate(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_hourly_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_dow_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_child_tag_breakdown(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_fulfillment_distribution(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'public.get_tag_accuracy_trend(uuid,uuid,timestamp with time zone,timestamp with time zone,text)',
    'public.get_tag_recent_entries(uuid,uuid,integer)',
    'public.get_daily_hours(uuid,integer)',
    'public.get_monthly_hours(uuid,integer)',
    'public.get_active_dates(uuid,date,date)',
    'public.get_energy_map(uuid,date,date)',
    'public.get_time_pl_data(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer)',
    'public.get_stats_page_data(uuid,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,integer,integer,integer,integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    target := to_regprocedure(fn);
    IF target IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', target);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', target);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', target);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', target);
    END IF;
  END LOOP;
END;
$$;
