-- インデックス最適化: 冗長インデックス削除 + tags 複合インデックス追加
-- 上位の複合インデックスで代替可能な単一列インデックスを削除し、書き込み性能を改善

-- ============================================================
-- ADD: tags 複合インデックス
-- HOT PATH: WHERE user_id = X AND is_active = true ORDER BY sort_order
-- ============================================================
CREATE INDEX idx_tags_user_active
  ON public.tags (user_id, is_active);

-- ============================================================
-- DROP: entries — 冗長インデックス
-- ============================================================

-- idx_plans_user_id: idx_plans_user_start_time (user_id, start_time) の先頭列で代替
DROP INDEX IF EXISTS public.idx_plans_user_id;

-- idx_plans_start_time: user_id なしでは検索されない
DROP INDEX IF EXISTS public.idx_plans_start_time;

-- idx_entries_end_time: user_id なし。重複チェックは idx_entries_user_time_range でカバー
DROP INDEX IF EXISTS public.idx_entries_end_time;

-- ============================================================
-- DROP: tags — 新 idx_tags_user_active + idx_tags_user_id_name で代替
-- ============================================================

-- idx_tags_user_id: idx_tags_user_id_name と idx_tags_user_active の先頭列で代替
DROP INDEX IF EXISTS public.idx_tags_user_id;

-- idx_tags_name: user_id なしで name 単体検索なし
DROP INDEX IF EXISTS public.idx_tags_name;

-- idx_tags_is_active: boolean 単体は低選択性。idx_tags_user_active で置換
DROP INDEX IF EXISTS public.idx_tags_is_active;

-- ============================================================
-- DROP: notifications — 複合インデックスで代替
-- ============================================================

-- idx_notifications_user_id: idx_notifications_user_created の先頭列で代替
DROP INDEX IF EXISTS public.idx_notifications_user_id;

-- idx_notifications_type: 常に user_id と併用。type 単体は低選択性
DROP INDEX IF EXISTS public.idx_notifications_type;
