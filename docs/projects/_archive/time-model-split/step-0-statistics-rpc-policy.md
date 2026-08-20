---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/timeblock/server/statistics.ts
  - apps/product/src/features/timeblock/server/statistics-general-router.ts
  - apps/product/src/features/timeblock/server/statistics-kpi-router.ts
  - apps/product/src/features/timeblock/server/statistics-summary-router.ts
  - supabase/migrations/20260610000000_entry_auto_record_model.sql
---

# Step 0: 統計 RPC 書き換え方針

Phase 1 の schema / server 実装に入る前に、`entries_effective` 前提の統計 RPC をどう扱うかを閉じる。結論: **統計ロジックは TS service 層へ移し、PL/pgSQL 統計 RPC は compatibility asset として呼び出し元を消してから drop する**。

## Goal

Plan / Log 分割後の統計を `logs` / `plans` の明示モデルで表現し、`entries_effective` と PL/pgSQL 統計 RPC への新規依存を増やさない。

## Current Inventory

現行アプリの生存呼び出し面は、DB 側に残る関数数より小さい。

| Surface                          | 現行の主な呼び出し                                                                                                                 | 備考                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `entriesStatisticsGeneralRouter` | `get_tag_stats` / `get_time_by_tag` / `get_daily_hours` / `get_hourly_distribution` / `get_dow_distribution` / `get_monthly_hours` | Calendar sidebar / Stats 系                                |
| `entriesStatisticsKpiRouter`     | `get_estimation_accuracy` / `get_blank_rate`                                                                                       | 個別 KPI                                                   |
| `entriesStatisticsSummaryRouter` | `get_active_dates` / `get_stats_kpi_summary` / `get_time_pl_data` / `get_stats_page_data`                                          | Review / Time P/L の統合 RPC                               |
| `entriesTagStatisticsRouter`     | `entries` 直読み                                                                                                                   | タグ詳細 dashboard。`entries_effective` は直接読んでいない |
| `TagStatisticsService`           | `get_tag_stats`                                                                                                                    | Tags feature 側の tag stats                                |
| DB migration asset               | `20260610000000_entry_auto_record_model.sql` 内の `entries_effective` + 統計関数群                                                 | auto-record model のための旧定義                           |

## Decision

1. **TS service 化を採用する**。`.claude/rules/architecture.md` の「新規の集計・ビジネスロジックは TS の service 層」に合わせ、Plan / Log 分割後の統計定義は TS を canonical source にする。
2. **統計 RPC は新設しない**。RLS で表現できない原子的バッチ操作だけ RPC を許可する方針なので、集計のためだけの PL/pgSQL 関数は追加しない。
3. **既存 PL/pgSQL 統計 RPC は凍結資産として段階的に外す**。Phase 1 中にアプリ側呼び出しを TS service に差し替え、呼び出しゼロを確認してから drop migration を別 Step に切る。
4. **`entries_effective` は migration backfill の最後の用途に限定する**。auto-record の実体化 backfill が終わった後、runtime の統計・UI からは参照しない。
5. **統計の意味は source table で明示する**。実績系は `logs`、予定系は `plans`、予実比較は `plans` と `logs.plan_id` の join を読む。Plan / Log を単一 effective range に潰さない。

## Minimum Viable Approach

1. `apps/product/src/features/timeblock/server/statistics-service.ts` を追加し、現行 router の procedure 名は維持したまま内部実装を service 呼び出しへ差し替える。
2. service は `plans` / `logs` / `tags` を必要な範囲で select し、既存 domain aggregator / response transformer を再利用する。まず生存 procedure の互換レスポンスを守る。
3. `get_stats_page_data` / `get_stats_kpi_summary` / `get_time_pl_data` のような統合 RPC は、router の public contract を維持しつつ TS 側で同形 JSON を組み立てる。
4. `TagStatisticsService` と `entriesTagStatisticsRouter` も `logs` / `plans` 読みに寄せる。Tags feature から `get_tag_stats` RPC への依存を残さない。
5. 呼び出し元が消えたことを `rg "rpc\\('get_" apps/product/src` で確認してから、統計 RPC / `entries_effective` drop を後続 migration PR に切る。

## Aggregation Source Contract

| 統計カテゴリ                                               | Source                                 | 方針                                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 実績時間、active dates、hourly / dow / monthly、energy map | `logs`                                 | 明示された記録だけを読む。Phase 1 migration で実体化した auto-record log も log として扱うかは unresolved 4 の決定に従う |
| タグ別件数・最終利用                                       | `logs` を主、必要なら `plans` を別指標 | 現行 `getTagStats` の意味を「実績ベース」に寄せる。予定件数が UI に必要なら別 field として追加する                       |
| blank rate / planned minutes / budget                      | `plans`                                | 予定レイヤーだけを読む。`skipped_at` は計画履歴に残るが、実績集計には混ぜない                                            |
| estimation accuracy                                        | `plans` LEFT JOIN `logs`               | `plan_id` ごとに log duration を合算し、plan duration と比較する。1:N を前提にする                                       |
| Review diff                                                | `plans` + `logs`                       | `computeCalendarDayDiffs` の再定義に合わせ、統計 RPC ではなく Review / Calendar domain の計算として扱う                  |

## Reversibility Table

| Step                                          | Tag            | 備考                                                                                   |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------- |
| Router 内部を TS service に差し替え           | [minutes]      | code revert で戻せる                                                                   |
| 統計 RPC 呼び出し削除                         | [minutes]      | 呼び出し元差し替えのみなら revert 可能                                                 |
| `entries_effective` / 統計 RPC drop migration | [hours]        | migration rollback が必要。呼び出しゼロ確認後に別 PR で実施                            |
| auto-record backfill の集計上の扱い           | [irreversible] | `overview.md` §8 未決 4 の決定に依存。実体化後に明示記録との区別を落とすと復元できない |

## Existing Code to Reuse

- `apps/product/src/features/timeblock/server/statistics.ts` — router の public procedure 名を維持する集約点
- `apps/product/src/features/timeblock/server/statistics-shared.ts` — input schema / error handling / response 型
- `apps/product/src/features/timeblock/server/statistics-overview-transform.ts` — overview response unpacking の既存 contract
- `apps/product/src/features/timeblock/server/statistics-time-by-tag-transform.ts` — time-by-tag response mapping
- `apps/product/src/features/timeblock/server/statistics-kpi-unpackers.ts` — KPI response の null-safe unpacking
- `apps/product/src/features/timeblock/domain/*distribution.ts` / `monthly-trend.ts` / `tag-stats.ts` / `estimation-accuracy.ts` — TS aggregation の既存部品
- `apps/product/src/features/timeblock/server/tag-statistics.ts` — tag dashboard の direct select + domain build pattern
- `apps/product/src/features/timeblock/domain/tag-dashboard.ts` — tag dashboard aggregation

## What I'm Not Doing

- 統計 RPC の PL/pgSQL 再実装はしない。Plan / Log 分割後の新しい意味を DB 関数へ沈めると、同じ負債を作り直すため。
- `entries_effective` 互換 view を `plans` / `logs` 上に作らない。互換 view は単一 effective range へ潰すため、1:N log と未記録 plan を見えにくくする。
- router の public procedure 名をこの Step で変えない。UI 側の呼び出し移行と time model 分割を同時にやると blast radius が広がるため。
- Stats / Review の UI redesign はこの Step ではやらない。数値の意味と source table の契約だけを先に固定する。
