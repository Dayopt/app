-- I-15: tag-detail dead chain の DB 側（孤児 RPC）を drop する
--
-- 背景:
--   PR #1290（粒度適応型 Review 再設計）でタグ詳細チャートが孤児化し、
--   I-04（PR #1320）でそれらを呼ぶ tRPC procedure（getTagOverview /
--   getTagTimeline / 個別 tag stats）と client hook をコード側から削除した。
--   その結果、以下 9 個の RPC は呼び出し元が存在しなくなった。
--   liveness 表: apps/storybook/docs/product/projects/codebase-refactoring/tag-detail-liveness.md
--
-- 安全性の根拠:
--   - コード全域（apps/product/src・supabase/functions・scripts）の grep で
--     これら関数の呼び出し元ゼロを確認済み（唯一の呼び出し元 tag-statistics.ts
--     の該当 procedure は I-04 で削除、main に merge 済み＝production deploy 済み）
--   - getTagDashboard（LIVE）はこれら RPC を呼ばない（直接 table query）
--
-- 入力シグネチャは初出（20260330000000 / 20260330100000 / 20260513000000）から
-- 最新定義（20260610000000）まで一貫しており、オーバーロード残存はない。
--
-- ROLLBACK 手順（復元する場合・所要数分）:
--   1. 20260610000000_entry_auto_record_model.sql 内の以下 9 関数の
--      `CREATE OR REPLACE FUNCTION public.get_tag_*` / `get_child_tag_breakdown`
--      ブロックを新規 migration として再適用する
--   2. 20260604230607_harden_function_execute_privileges.sql と同様に
--      各関数へ `GRANT EXECUTE ON FUNCTION ... TO authenticated` を再付与する
--      （これら 9 関数は同 migration の authenticated_functions 配列に含まれる）

DROP FUNCTION IF EXISTS public.get_tag_cumulative_time(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_avg_fulfillment(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_plan_rate(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_hourly_distribution(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_dow_distribution(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_child_tag_breakdown(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_fulfillment_distribution(uuid, uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_tag_accuracy_trend(uuid, uuid, timestamptz, timestamptz, text);
DROP FUNCTION IF EXISTS public.get_tag_recent_entries(uuid, uuid, integer);
