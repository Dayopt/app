-- P1: Stats系RPC全体の高速化
-- get_daily_hours, get_monthly_hours, get_energy_map, get_stats_page_data,
-- get_active_dates, get_tag_cumulative_time が恩恵を受ける
-- 部分インデックスでソフト削除行を除外しサイズを抑える
CREATE INDEX IF NOT EXISTS idx_entries_user_start_not_deleted
  ON public.entries(user_id, start_time)
  WHERE deleted_at IS NULL;

-- P2: 通知一覧のページネーション高速化
-- notification-service.ts の list() が user_id + created_at DESC + range で取得
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- P3: タグ詳細ページの9並列RPC高速化
-- get_tag_cumulative_time 等が (user_id, tag_id) で絞り込む
CREATE INDEX IF NOT EXISTS idx_entry_tags_user_tag
  ON public.entry_tags(user_id, tag_id);
