---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/timeblock/server/statistics.ts
  - apps/product/src/features/timeblock/server/tag-statistics.ts
---

# Step 4: 統計 TS service

Step 0 の Aggregation Source Contract を実装する。`plans` / `logs` を読む `statistics-service.ts` を新設し、既存 router の内部と**差し替え可能な状態**まで作る。router への接続（public 挙動の切り替え）は Step 8 のフリップで行う。

## Goal

現行 PL/pgSQL 統計 RPC の生存呼び出し面すべてに対応する TS 実装を、互換レスポンス形のまま用意する。

## Minimum Viable Approach

1. `apps/product/src/features/timeblock/server/statistics-service.ts` を追加。Step 0 の contract に従い、実績系は `logs`、予定系は `plans`、予実比較は `plans LEFT JOIN logs (plan_id)` を読む
2. 対応する procedure 面（Step 0 Current Inventory の全行）:
   - general: tag stats / time-by-tag / daily hours / hourly / dow / monthly
   - kpi: estimation accuracy / blank rate
   - summary: active dates / kpi summary / Time P/L / stats page data（統合 JSON を TS で同形に組み立てる）
   - `entriesTagStatisticsRouter` / `TagStatisticsService` の logs / plans 読み替え
3. **見積もり精度の分母**: `source = 'auto_migrated'`（Step 2 未決 4 の決定値）の logs を除外する。ワンタップ記録（`from_plan`）はユーザーが確定した実績なので分母に入れる
4. **並走比較で検証する**: Step 2 の backfill 済みデータに対し、旧 RPC の結果と新 service の結果を突き合わせる比較テストを書く。auto-record の意味論差（旧: read 時導出 / 新: 実体化済み）による既知の差分は明示的に許容リストにする
5. router 内部の差し替えは feature flag や分岐を入れず、**Step 8 で procedure 実装を丸ごと入れ替える**前提でシグネチャを揃えておく

## Scope

追加する: statistics-service.ts、domain aggregator の 1:N 対応、並走比較テスト。
追加しない: router public 挙動の変更、RPC / `entries_effective` の drop（Step 9）、Review UI（Step 7）。

## Reversibility Table

| Step                     | Tag       | 備考                               |
| ------------------------ | --------- | ---------------------------------- |
| statistics-service 追加  | [minutes] | 未接続。revert で消せる            |
| domain aggregator の変更 | [minutes] | 既存テストが regression を検出する |

## Existing Code to Reuse

- `apps/product/src/features/timeblock/server/statistics-shared.ts` — input schema / error handling / response 型
- `apps/product/src/features/timeblock/server/statistics-overview-transform.ts` / `statistics-time-by-tag-transform.ts` / `statistics-kpi-unpackers.ts` — 互換レスポンスの契約
- `apps/product/src/features/timeblock/domain/` の distribution / monthly-trend / tag-stats / estimation-accuracy — TS aggregation 部品（1:N 対応の改修ベース）
- `apps/product/src/features/timeblock/server/tag-statistics.ts` — direct select + domain build の既存パターン

## What I'm Not Doing

- PL/pgSQL 統計 RPC の新設・改修はしない（Step 0 Decision 2）
- `entries_effective` 互換 view を plans / logs 上に作らない（Step 0 What I'm Not Doing）
- Stats / Review の UI 変更はしない（Step 7）

## Follow-up

次は Step 5(Calendar 2レーン表示)。UI 系 Step（5-7）と本 Step は依存が薄いので、並行に進めてもよい。
