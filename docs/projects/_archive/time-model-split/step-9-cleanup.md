---
status: current
last_verified: 2026-07-13
code:
  - apps/product/src/features/timeblock
  - supabase/migrations
  - docs/product/specs/plan-record.md
---

# Step 9: 非破壊 cleanup と entries DB 資産の段階撤去（完了）

Step 8 で runtime の正を Plan / Record に切り替えた後、旧コードと DB 資産を同時に消さず、deploy 間隙で旧アプリを壊さない順序で project を完了した。

## Goal

公開概念とコードを Plan / Record / Timeblock に統一し、本番稼働確認後に `entries` を削除して物理 DB を `records` へ移行する。2026-07-13 に Step 9c まで完了した。

## Minimum Viable Approach

1. **Step 9a 非破壊 cleanup**（#1578）
   - entries の live 参照、旧 CRUD、Inspector、単一レーン、auto-record dead code を除去する
   - `features/entry` を `features/timeblock` へ移し、tRPC を `plans` / `records` / `statistics` に分ける
   - 公開契約を MCP `records.list`、GDPR `records`、Inspector URL `timeblock=record:` に切り替える
   - 当時の物理 DB `logs` は `databaseTables.records` adapter の背後に残した。この adapter は Step 9b で物理 `records` へ切り替え、現在は存在しない
   - product/docs は Record 表記へ更新し、DB が移行中であることを明記する
2. **稼働確認**
   - Step 9a merge 後の Sentry と Calendar / Review / GDPR / MCP 主要動線を確認する
   - #1462 を解決し、production migration history と repository の同期を確認する
   - backup / PITR、Step 2 の件数・時間・`plan_id` 突合を確認する
   - 約1週間の待機条件は 2026-07-12 の Tomoya 判断で解除済み。期間ではなく上記の実測ゲートで判断する
3. **Step 9b destructive migration**（#1579）
   - `logs` table を `records` へ rename し、旧 deploy 用の一時 `logs` view / RPC alias を作る
   - catalog で完全 signature と依存を確認してから、entries 依存 RPC、`entries_effective`、`entries` を drop する
   - reading schema、生成型、RLS snapshot を migration 適用済み local DB から merge 前に再生成する
4. **Step 9c contract cleanup**（#1580）
   - 新アプリの安定確認後、`20260713120023_drop_time_model_compatibility_layer.sql` で一時 `logs` view と Log 名 RPC alias 3件を drop した
   - clean replay で判明した baseline table grant の欠落を `20260713121911_restore_baseline_table_grants.sql` で production と一致させた。profiles の billing column 制限は維持した
   - migration 適用済み local DB から生成型と RLS snapshot を再生成し、Record 用語を runtime code と current docs へ統一した
   - [summary.md](./summary.md) を追加した。旧モデル issue の close / 改稿は着地 PR の merge 後に実施する

## Reversibility Table

| Step                           | Tag            | 備考                                       |
| ------------------------------ | -------------- | ------------------------------------------ |
| Step 9a code / docs            | [minutes]      | commit 単位で revert 可能                  |
| 公開契約の breaking rename     | [irreversible] | 旧 MCP / export / URL 契約は維持しない決定 |
| `logs` → `records` + 一時 view | [hours]        | 逆 rename または view で復旧可能           |
| entries table drop             | [days]         | backup / PITR と事前突合を必須にする       |
| 一時 DB 互換層 drop            | [hours]        | 必要なら view / RPC alias を再作成できる   |

## Existing Code to Reuse

- `databaseTables.records` — Step 9a で導入し、Step 9b で物理 `records` を指す最終形へ移行した table 定数
- Step 2 の突合仕様 — drop 前の最終検証
- `scripts/generate-rls-snapshot.ts` — Step 9b / 9c の RLS snapshot
- `docs/_templates/spec.md` — Plan / Record stock spec

## What I'm Not Doing

- 1 PR に code removal と destructive migration を混在させない
- 生成型や RLS snapshot を手編集・post-merge 作業へ回さない
- MCP `entries.list` 合成互換は削除しない
- Phase 2 の external sync / ghost / calendar connections には着手しない
- 過去 ADR / log 本文は改稿しない

## Completion

2026-07-13 に Step 9c の migration upgrade / fresh replay、baseline grant 補完、DB lint、生成物更新、`summary.md` 追加を完了した。production 反映後の監視と旧 issue 整理は着地 PR の merge 後に行う。
