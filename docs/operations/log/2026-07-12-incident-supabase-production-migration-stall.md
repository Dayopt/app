---
status: frozen
updated: 2026-07-12
issue: 1462
---

# Supabase production migration 停止

Supabase GitHub integration は production migration を起動していたが、最初の未適用 migration の CHECK 制約違反により、2026-06-10 以降の schema change が production に反映されていなかった。

---

## 起きた事実

- 2026-07-08 に main branch の `MIGRATIONS_FAILED` と、production migration history が `20260604232051_grant_authenticated_rpc_helpers` で停止していることを確認した。
- 2026-07-12 の PR #1581 merge 後、GitHub integration は production deployment を再実行した。
- `20260610000000_entry_auto_record_model.sql` の statement 9 で `entries_actual_time_order` 違反が発生し、後続 migration は適用されなかった。
- 当該 migration は、旧 CHECK 制約を残したまま planned entry の actual range を `NULL` に正規化し、その後で制約を再定義する順序だった。
- production では entries 51件のうち26件が正規化対象だった。partial actual range は0件だった。
- production には `plans` / `logs` / `records` table がなく、time-model-split の DB migration は未到達だった。

## 影響範囲

- repository と production schema の migration history が不一致になった。
- Step 8 / Step 9a のアプリケーション deploy は成功したが、production DB に Plan / Record 保存先がない状態になった。
- #1579 の entries drop と `logs` → `records` rename は、前提 table がないため着手できなかった。
- clean database と空データの Preview Branch では対象 backfill が0件となり、操作順序の不具合を検知できなかった。

## 学び

- data cleanup で既存 CHECK が許可しない中間状態を作る場合、旧制約を backfill より前に解除し、同じ deploy 内で新制約を再作成する。
- clean migration replay だけでなく、production catalog と集約件数を read-only で確認し、既存データを持つ schema への適用順序をレビューする。
- Supabase Preview が green でも、production migration history と branch-action log を merge 後に確認する。
- 後続 migration では先行 migration の失敗を越えられない。既存 migration を改変せず、production の最終適用版と失敗版の間に forward-only bridge migration を置く。
