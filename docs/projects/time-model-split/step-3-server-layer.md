---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/entry/server
  - apps/product/src/features/entry/schemas
  - apps/product/src/features/entry/types
---

# Step 3: plans / logs server 層

Plan / Log の型・Zod schema・service・tRPC router を追加する。root router に登録はするが **UI からは未接続（dormant）**。entries router は一切触らない。

## Goal

Plan / Log の CRUD + ワンタップ記録 + 一括確定を、時間ガード・重なりチェック込みで server 層として完成させる。

## 決めること（overview §8 未決 8）

feature 配置。

- **Option α（推奨）**: 既存 `features/entry/` をコンテナとして維持し、その中に `plan-service.ts` / `log-service.ts` / `plans-router.ts` / `logs-router.ts` を追加する。calendar（191ファイル）が entry barrel に依存しており、ディレクトリ改名は Phase 1 の blast radius を無意味に広げる。`features/log/` を作らないので `@/lib/logger` との衝突も発生しない
- Option β: `features/plans/` / `features/logs/` を新設。概念的には綺麗だが、共有エディタ・共有 domain の置き場が第3の場所に必要になり、feature DAG の組み替えが Phase 1 に混入する

## Minimum Viable Approach

1. types / schemas: `Plan` / `Log` 型と Zod schema（`@dayopt/domain` の enum 追加を含む）。エディタ共有（overview §4）を見据え、共通フィールドは共有 shape から合成する
2. `plan-service.ts`: CRUD + ガード
   - **時間ルール**: create / update とも `end_at > now()` を強制（過去 Plan は作れない）。past plan（end ≤ now）は時間フィールド変更を拒否、title / tag / note は許可（ADR-015、overview §4 マトリクス）
   - skip / unskip（過去 plan のみ skip 可、現行 `SKIP_IN_FUTURE` と同じ向き）
   - 重なり: EXCLUDE 違反 `23P01` → `TIME_OVERLAP` へのマッピング（現行 entry-service と同じパターン）+ 事前チェック
3. `log-service.ts`: CRUD + ガード
   - **時間ルール**: `end_at <= now()` を強制（未来の記録は作れない。現行 `RECORD_IN_FUTURE` / `UNPLANNED_IN_FUTURE` の後継）
   - `plan_id` の付け替え（後から予定に紐づける）を許可。owner 整合は Step 1 の trigger が DB 側で防衛
4. 複合 procedure:
   - `plans.record`（ワンタップ「そのまま記録」）: plan range をコピーした log を作成（`source = 'from_plan'`）。past plan のみ
   - `plans.confirmDay`（一括「この日を確定」）: 指定日の未記録・未 skip past plans をまとめて log 化。部分失敗が残らないよう単一トランザクションにする。RLS で表現できない原子的バッチに該当するなら Step 0 方針の例外として RPC 化を許可（`bulk_soft_delete_entries` の前例）
5. soft delete / restore: SELECT RLS が deleted を隠すため、entries と同様に restore 経路（RPC or service role）を plans / logs にも用意する
6. root router へ `plans` / `logs` namespace を登録（dormant）。楽観ロック（`expectedUpdatedAt`）は現行 entries.update と同じ規約を踏襲

## Scope

追加する: 型・schema・service・router・複合 procedure・soft delete/restore 経路・unit / integration test。
追加しない: UI、統計（Step 4）、entries router の変更、MCP tools（Step 8）。

## Reversibility Table

| Step                             | Tag       | 備考                           |
| -------------------------------- | --------- | ------------------------------ |
| service / router 追加            | [minutes] | dormant なので revert で消せる |
| confirmDay の RPC 化（採る場合） | [hours]   | migration rollback が必要      |

## Existing Code to Reuse

- `apps/product/src/features/entry/server/entry-service.ts` — 時間ガード（`RECORD_IN_FUTURE` 等）・楽観ロック・`normalize*Input` のパターン
- `apps/product/src/features/entry/server/entry-overlap-service.ts` — 半開区間の重なり判定と `23P01` マッピング
- `apps/product/src/features/entry/server/entry-service-error.ts` — エラー正規化
- `supabase/migrations/20260323000001_add_soft_delete_rpc.sql` — soft delete / restore RPC の前例
- project skills: `trpc-router-creating` / `error-handling` / `test`

## What I'm Not Doing

- Plan ⇄ Log の相互変換 procedure は作らない（現行 `convertPlannedToUnplanned` 系の後継は不要。保存先は end で一意に決まり、間違いは削除 + 再作成で足りる）
- entries router の deprecation 表示や書き込み制限はしない（Step 8）

## Follow-up

次は Step 4（統計 TS service）。本 Step の service が読み書きの正になるため、統計はここで固まった型を読む。
