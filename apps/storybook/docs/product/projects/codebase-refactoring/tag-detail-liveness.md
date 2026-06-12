# I-02: tag-detail dead chain — 4 層 liveness 表（2026-06-12）

> **目的**: PR #1290（Review 全面再設計）で孤児化した実装の生死境界を export 単位で確定する。Q1（削除承認済み）の実行資料。
> **削除順序**: コード側（Layer 1-3）= I-04 → production deploy → Sentry 静穏確認 → DB RPC（Layer 4）= I-15。**順序を分断しない。**
> **検証コマンド**: 各行の根拠は `grep -rn "<シンボル名>" apps/product/src` で再現可能。

## Layer 1: コンポーネント（6 件 — 全て DEAD）

`apps/product/src/features/review/components/tag-detail/`

| component                      | 使用 hook           | 外部参照                                          | 判定     |
| ------------------------------ | ------------------- | ------------------------------------------------- | -------- |
| TagDetailHero.tsx              | useTagOverviewData  | ゼロ（knip unused file。grep hit はコメントのみ） | **DEAD** |
| TagDowChart.tsx                | useTagOverviewData  | ゼロ（RhythmCharts.tsx:68 はコメント言及のみ）    | **DEAD** |
| TagHourlyChart.tsx             | useTagOverviewData  | ゼロ                                              | **DEAD** |
| TagFulfillmentDistribution.tsx | useTagOverviewData  | ゼロ                                              | **DEAD** |
| TagRecentBlocks.tsx            | useTagRecentEntries | ゼロ                                              | **DEAD** |
| TagAccuracyTrendChart.tsx      | useTagTimelineData  | ゼロ                                              | **DEAD** |

LIVE（削除禁止）: `TagDetailPage.tsx`（route `/review/tags/[tagId]` から使用）、`TagDetailTitle.tsx`（TagDetailPage.tsx:21 が import）、`__tests__/TagDetailPage.test.tsx`

## Layer 2: hooks（`features/review/hooks/useTagDetailData.ts` の 4 export）

| hook（行）                  | 消費者                               | 呼ぶ procedure                                  | 判定                                                 |
| --------------------------- | ------------------------------------ | ----------------------------------------------- | ---------------------------------------------------- |
| useTagOverviewData（:38）   | DEAD コンポーネント 4 件のみ         | `entries.getTagOverview`（:49）                 | **DEAD**                                             |
| useTagTimelineData（:55）   | TagAccuracyTrendChart のみ           | `entries.getTagTimeline`（:68）                 | **DEAD**                                             |
| useTagDashboardData（:76）  | **TagDetailPage.tsx:15,257（LIVE）** | `entries.getTagDashboard`（:87）                | **LIVE — 削除禁止**                                  |
| useTagRecentEntries（:106） | TagRecentBlocks のみ                 | `entries.list`（:109）= **共有 LIVE procedure** | **DEAD**（hook のみ削除。`entries.list` は触らない） |

→ ファイルは残し、DEAD な 3 hooks を export 単位で削除する。

## Layer 3: tRPC procedures（`features/entry/server/tag-statistics.ts` の 12 procedure）

| procedure（行）                       | 呼び出し元                                                       | 呼ぶ RPC                                 | 判定                |
| ------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- | ------------------- |
| getTagDashboard（:96）                | useTagDashboardData + `features/review/lib/prefetchTagDetail.ts` | **なし（RPC 非依存）**                   | **LIVE — 削除禁止** |
| getTagOverview（:162）                | DEAD hook のみ                                                   | :185-191 の 7 RPC                        | **DEAD**            |
| getTagTimeline（:280）                | DEAD hook のみ                                                   | :290,:296 の 2 RPC                       | **DEAD**            |
| getTagCumulativeTime（:347）          | **ゼロ**                                                         | get_tag_cumulative_time（:355）          | **DEAD**            |
| getTagAvgFulfillment（:381）          | **ゼロ**                                                         | get_tag_avg_fulfillment（:389）          | **DEAD**            |
| getTagPlanRate（:418）                | **ゼロ**                                                         | get_tag_plan_rate（:426）                | **DEAD**            |
| getTagHourlyDistribution（:460）      | **ゼロ**                                                         | get_tag_hourly_distribution（:470）      | **DEAD**            |
| getTagDowDistribution（:504）         | **ゼロ**                                                         | get_tag_dow_distribution（:512）         | **DEAD**            |
| getChildTagBreakdown（:548）          | **ゼロ**                                                         | get_child_tag_breakdown（:556）          | **DEAD**            |
| getTagFulfillmentDistribution（:593） | **ゼロ**                                                         | get_tag_fulfillment_distribution（:603） | **DEAD**            |
| getTagAccuracyTrend（:632）           | **ゼロ**                                                         | get_tag_accuracy_trend（:644）           | **DEAD**            |
| getTagRecentEntries（:679）           | **ゼロ**                                                         | get_tag_recent_entries（:692）           | **DEAD**            |

→ 12 中 11 procedure が DEAD。同ファイル冒頭の入力 zod schema（:55-92）のうち DEAD procedure 専用のものも同時に削除。

## Layer 4: DB RPC（9 関数 — Layer 3 削除後に全て孤児化）

src / supabase/functions / scripts 全域で、呼び出し元は tag-statistics.ts のみ（確認済み）。

| RPC                              | 初出 migration                                     | 最新定義（= rollback 元）                  |
| -------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| get_tag_cumulative_time          | 20260330000000_add_tag_detail_functions.sql        | 20260610000000_entry_auto_record_model.sql |
| get_tag_avg_fulfillment          | 20260330000000                                     | 20260610000000                             |
| get_tag_plan_rate                | 20260330000000                                     | 20260610000000                             |
| get_tag_hourly_distribution      | 20260330000000                                     | 20260610000000                             |
| get_tag_dow_distribution         | 20260330000000                                     | 20260610000000                             |
| get_child_tag_breakdown          | 20260330000000                                     | 20260610000000                             |
| get_tag_fulfillment_distribution | 20260330100000_add_tag_detail_phase2_functions.sql | 20260610000000                             |
| get_tag_accuracy_trend           | 20260330100000                                     | 20260610000000                             |
| get_tag_recent_entries           | 20260513000000_entry_two_layer_time_ranges.sql     | 20260610000000                             |

**rollback 手順（I-15 の PR に必須記載）**: `20260610000000_entry_auto_record_model.sql` 内の該当 `CREATE OR REPLACE FUNCTION` を新規 migration として再適用（所要数分）。

## I-04 実行時の注意

- **i18n**: DEAD コンポーネントは `calendar.stats.tagDetail` / `tags` namespace を使用。**LIVE な TagDetailPage も同 namespace を使う**ため、namespace ごと削除は不可。キー単位で「DEAD コンポーネントのみが使うキー」を特定して削除し、`pnpm lint:i18n` で検証
- **stories / tests**: DEAD コンポーネントの `*.stories.tsx` / テストがあれば同時削除
- **削除後の knip**: unused files から tag-detail 6 件が消えることを確認（11 → 5 件になるはず）
