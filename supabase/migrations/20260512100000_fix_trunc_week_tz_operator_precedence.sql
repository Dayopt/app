-- trunc_week_tz の AT TIME ZONE 演算子優先順位バグを修正する
--
-- 旧: date_trunc(...) + interval AT TIME ZONE tz
--     → PostgreSQL が `interval AT TIME ZONE tz` と解釈し
--       timezone(text, interval) を呼ぼうとして失敗（SQLSTATE 42883）
-- 新: (date_trunc(...) + interval) AT TIME ZONE tz
--     → 括弧で意図を明示
CREATE OR REPLACE FUNCTION public.trunc_week_tz(
  ts TIMESTAMPTZ,
  tz TEXT,
  week_start INT DEFAULT 1
) RETURNS TIMESTAMPTZ AS $$
  SELECT (date_trunc('week', (ts AT TIME ZONE tz) - ((week_start) || ' days')::interval)
         + (week_start || ' days')::interval)
         AT TIME ZONE tz;
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
