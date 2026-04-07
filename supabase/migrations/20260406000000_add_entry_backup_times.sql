-- 計画外エントリ: 予定時間のバックアップカラムを追加
-- 「計画外にする」で origin='unplanned' に変更する際、元の予定時間を保持して復元可能にする

ALTER TABLE public.entries
  ADD COLUMN backed_up_start_time TIMESTAMPTZ,
  ADD COLUMN backed_up_end_time TIMESTAMPTZ;

COMMENT ON COLUMN public.entries.backed_up_start_time IS '計画外にする前の予定開始時刻（復元用）';
COMMENT ON COLUMN public.entries.backed_up_end_time IS '計画外にする前の予定終了時刻（復元用）';
