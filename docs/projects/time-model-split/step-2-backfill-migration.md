---
status: current
last_verified: 2026-07-14
code:
  - supabase/migrations/20260708232500_add_time_model_tables.sql
---

# Step 2: entries → plans / logs backfill migration

`entries` の全歴史（soft delete 込み）を Step 1 の新テーブルへ**冪等に**実体化する。entries は温存し、runtime は一切切り替えない。cutover（Step 8）でこの backfill を再実行して delta を吸収するため、再実行可能であることが最重要要件。

## Goal

entries の全データを plans / logs として実体化し、いつでも再実行して最新化できる backfill を作る。

## 決定（overview §8 未決 4）

auto-record 実体化 log を明示記録と区別するか。

- **採用: Option α**: `logs.source` に `auto_migrated` を追加（Step 1 の source CHECK を拡張）。provenance は source の責務そのものであり、ADR-019 の「自動記録は見積もり精度の分母に入れない」意味論を Step 4 で継承できる
- Option β: `logs.auto_recorded boolean` 列を追加。source の意味を汚さないが、列が1つ増える
- Option γ: 区別しない。最小だが精度指標が恒久的に汚れ、後から復元不能（[irreversible]）

## Minimum Viable Approach

1. **id を決定的にマッピングする**: planned entry → `plans.id = entries.id`、unplanned entry → `logs.id = entries.id`、planned entry の実績 log → `uuid_generate_v5(entry.id 名前空間, 'log')` 等の決定的導出。再実行前に各 entry から導出され得る全 deterministic id を管理対象として削除し、`logs -> plans` の順で掃除してから `plans -> logs` の順で再挿入する。これにより immediate EXCLUDE 制約の row-by-row update 衝突と `updated_at` trigger の上書きを避ける
2. 変換規則（overview §7 準拠）:
   - `origin = 'planned'` → plans（`start_time`/`end_time` → `start_at`/`end_at`、`skipped_at`・`deleted_at` 移設、`source = 'manual'`）
   - 明示 actual（両端 NOT NULL）→ logs（`plan_id` = 対応 plan、`source = 'from_plan'`、`fulfillment_score` 移設）。soft-deleted historical row など plan range が欠ける planned entry は plan FK を作れないため log 化しない
   - `origin = 'unplanned'` → logs（`plan_id` NULL、`source = 'manual'`）
   - auto-record（planned・actual NULL・未 skip・`end_time <= now()`）→ logs（plan range を実体化、source = 未決 4 の決定値）。effective actual の判定式は `entries_effective` と同一ロジックを backfill SQL 内に一度だけ書く
3. 管理対象行を delete/reinsert して冪等化。soft delete 行も `deleted_at` ごと移行（Step 1 の CHECK は deleted 行の歴史的 shape を許容済み）。`created_at` / `updated_at` は entries の値を明示挿入し、更新 trigger による replay 時の時刻変化を避ける
4. **EXCLUDE 整合の修復と事前検証**: 明示 actual 同士は現行 DB 制約で重なりゼロが保証済み。auto-record 実体化同士・auto-record × 明示 actual はサービス層防衛だった領域なので、期待 log 集合を作る前に重なり検出クエリを流す。明示 actual / unplanned と auto-record が衝突した場合は明示記録を優先して auto-record 側を soft delete し、auto-record 同士は `created_at` / `updated_at` / `id` で新しい側を soft delete する。修復後の期待 log 集合にも重なりが残る場合は migration を止める
5. 検証クエリを migration とペアで残す: 件数突合（planned 数 = plans 数、actual/unplanned/auto 数 = logs 数）、時間合計突合、`plan_id` 参照整合

## Scope

追加する: backfill migration（+ 未決 4 が α なら source CHECK 拡張）、検証クエリ。
追加しない: entries / entries_effective への変更、router、UI、cutover 時の delta 処理（= 本 migration の再実行、Step 8）。

## Reversibility Table

| Step                               | Tag            | 備考                                                                        |
| ---------------------------------- | -------------- | --------------------------------------------------------------------------- |
| backfill delete/reinsert           | [hours]        | 新テーブルはまだ未参照。TRUNCATE + 再実行で何度でもやり直せる。entries 無傷 |
| source CHECK 拡張（未決 4 = α 時） | [hours]        | 値の追加のみ。既存行に影響なし                                              |
| auto-record の区別を落とす（γ 時） | [irreversible] | 実体化後に「自動だったか」を復元できない。α / β なら回避                    |

## Existing Code to Reuse

- `apps/product/src/features/timeblock/domain/entry-time-model.ts` `getEffectiveActualRange()` — effective actual 判定の正（SQL へ転写する際の仕様書として。この backfill が最後の用途）
- `supabase/migrations/20260610000000_entry_auto_record_model.sql` — `entries_effective` の判定式（SQL 表現の参照元）
- `supabase/migrations/20260513000000_entry_two_layer_time_ranges.sql` L40-72 — 重なり検出 + 新しい側を soft delete する前例

## What I'm Not Doing

- entries の書き込み停止・freeze はしない。backfill 後も entries が正であり続け、新テーブルは cutover まで stale で構わない（再実行で追いつく）
- 変換した plans / logs への手修正はしない。修正が要るバグは backfill SQL を直して再実行する（冪等性を守る）

## Follow-up

次は Step 3（plans / logs server 層）。backfill 済みデータがあるので、service / router の動作確認が実データで可能になる。
