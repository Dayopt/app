-- #1330: 未参照統計 RPC を drop する（core-slim シリーズ）
--
-- 背景:
--   PR #1358（#1329/#1330 の TS 削除）で、client 参照ゼロだった統計 procedure
--   getEnergyMap / getContextSwitches / getCumulativeTime / getEntryRate を
--   statistics-kpi-router から削除し、getEnergyMap 専用 transform も削除した。
--   getAvgFulfillment は #1348 で upstream 既削除済み。
--   その結果、以下 5 個の RPC は呼び出し元が存在しなくなった。
--
-- 安全性の根拠:
--   - コード全域（apps/product/src）の grep で、これら関数を呼ぶ
--     supabase.rpc('<fn>') がゼロであることを確認済み（呼び出し元の tRPC
--     procedure は PR #1358 で削除、main に merge 済み＝production deploy 済み）
--   - DB 関数の本体からの内部呼び出しもゼロ（migration 全体の grep で、これら
--     関数名の出現は自身の CREATE/GRANT/REVOKE と harden migration の権限配列のみ。
--     get_stats_overview は energyMap を inline 集計しており get_energy_map() は呼ばない）
--   - 入力シグネチャは harden migration（20260604230607）の GRANT 列挙が
--     authoritative（get_energy_map は uuid,date,date／他 4 関数は
--     uuid,timestamptz,timestamptz）。get_energy_map のみ初期定義 20260318120000
--     由来の旧 (uuid,timestamptz,timestamptz) overload が残存しうるため、両 overload
--     を IF EXISTS で drop する（不在なら no-op）。
--
-- ROLLBACK 手順（復元する場合・所要数分）:
--   1. 以下の CREATE OR REPLACE FUNCTION ブロックを新規 migration として再適用する
--      - get_plan_rate / get_cumulative_time / get_avg_fulfillment:
--          20260318130000_fix_stats_context_switches_and_energy_map.sql
--      - get_context_switches:
--          20260415000000_inline_entry_tag_id.sql
--      - get_energy_map(uuid,date,date):
--          20260610000000_entry_auto_record_model.sql（または 20260317022728）
--   2. 20260604230607_harden_function_execute_privileges.sql と同様に
--      各関数へ `GRANT EXECUTE ON FUNCTION ... TO authenticated` を再付与する
--      （これら 5 関数は同 migration の authenticated_functions 配列に含まれる）

DROP FUNCTION IF EXISTS public.get_energy_map(uuid, date, date);
DROP FUNCTION IF EXISTS public.get_energy_map(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_context_switches(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_cumulative_time(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_plan_rate(uuid, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.get_avg_fulfillment(uuid, timestamptz, timestamptz);
