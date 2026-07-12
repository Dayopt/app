---
status: current
last_verified: 2026-07-12
code:
  - apps/product/src/features/timeblock
  - supabase/migrations
  - docs/product/specs/plan-record.md
---

# Step 9: 非破壊 cleanup と entries DB 資産の段階撤去

Step 8 で runtime の正を Plan / Record に切り替えた後、旧コードと DB 資産を同時に消さず、deploy 間隙で旧アプリを壊さない順序で project を完了する。

## Goal

公開概念とコードを Plan / Record / Timeblock に統一し、本番稼働確認後に `entries` を削除して物理 DB を `records` へ移行する。

## Minimum Viable Approach

1. **Step 9a 非破壊 cleanup**（#1578）
   - entries の live 参照、旧 CRUD、Inspector、単一レーン、auto-record dead code を除去する
   - `features/entry` を `features/timeblock` へ移し、tRPC を `plans` / `records` / `statistics` に分ける
   - 公開契約を MCP `records.list`、GDPR `records`、Inspector URL `timeblock=record:` に切り替える
   - 物理 DB `logs` は `databaseTables.records` adapter の背後に残す。migration と生成型は変更しない
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
   - 新アプリの安定確認後、一時 DB 互換層を drop する
   - `summary.md` を追加し、旧モデル issue を着地 PR へのリンク付きで close または改稿する

## Reversibility Table

| Step                           | Tag            | 備考                                       |
| ------------------------------ | -------------- | ------------------------------------------ |
| Step 9a code / docs            | [minutes]      | commit 単位で revert 可能                  |
| 公開契約の breaking rename     | [irreversible] | 旧 MCP / export / URL 契約は維持しない決定 |
| `logs` → `records` + 一時 view | [hours]        | 逆 rename または view で復旧可能           |
| entries table drop             | [days]         | backup / PITR と事前突合を必須にする       |
| 一時 DB 互換層 drop            | [hours]        | 必要なら view / RPC alias を再作成できる   |

## Existing Code to Reuse

- `databaseTables.records` — Step 9a の物理 `logs` adapter
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

Step 9c の production 安定確認と `summary.md` 追加をもって project 完了とする。
