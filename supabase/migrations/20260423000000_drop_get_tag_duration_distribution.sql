-- 未使用になった get_tag_duration_distribution RPC を削除
-- 20260422000000 で追加したが、sidebar クリック popover の仕様を duration
-- 候補 UI なしにシンプル化した結果、client 側から呼ばれなくなったため drop する
DROP FUNCTION IF EXISTS public.get_tag_duration_distribution(UUID, UUID, INT, INT);
