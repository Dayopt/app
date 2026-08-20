---
status: current
last_verified: 2026-08-20
code:
  - apps/product/src/features/timeblock/server
  - apps/product/src/features/timeblock/domain
  - apps/product/src/features/timeblock/hooks
  - apps/product/src/features/review/components
  - apps/product/src/features/tags
---

# tag-model-replacement — Step 5 残り（分析軸切替）+ Step 7 残余撤去（レーン G、#2247 + #2218）

[overview.md](./overview.md) §9 Step 5・Step 7 の実装詳細。#2176（Step 7 部分実施）着手時の実測で、Step 5 が「Time P/L のみ完了、見積もりキャリブレーション・タグダッシュボードは未着手」と判明したため（[overview.md:482-491](./overview.md#L482)）、残りをレーン G が #2247（設計）+ #2218（残余撤去）の統合束として実施する。User 指示「大きい PR にしてタグ系クリーンにする」（[#2247 dispatch コメント](https://github.com/Dayopt/dayopt/issues/2247)）により 1 branch・1 PR。

## 1. Goal

見積もりキャリブレーション・タグダッシュボード・Review 画面の残り 3 経路を activity 軸へ移行し、`features/tags` への実依存をコードから消す（DB の `tag_id` 列 drop は #2175 で別途）。

## 2. Minimum Viable Approach

骨格は 3 手。

1. **死んでいるものを消す**（タグ詳細ダッシュボード一式）
2. **型・アイコン・色の借用だけの箇所を機械的に置換する**（TimePL・ReviewDiffPanel・guard）
3. **activity 版が無い現役ロジック 2 本を新規実装する**（見積もり精度・見積もりキャリブレーション。当初想定していた時間帯別タグ集計は plan-review で消費者ゼロと判明し §3-A の削除対象へ移動）

この 3 手を終えると `features/tags` の実コード依存者は `calendar-prefetch.ts` の prefetch 1 箇所だけになり、`features/tags` 全体・`tag-filter/`・design token リネームまで一気に完了できる（#2218 の本来スコープ）。

## 3. 実測で確定した分類（一次資料）

2 本の並列調査（timeblock tag系12ファイル依存図、ReviewDiffPanel/tags依存図）と直接検証（`rg`/コードリーディング）による。

### 3-A. 削除（設計上すでに決着済み。コード整理のみ、判断不要）

`/plan-review`（plan-critic）実測により確定・訂正: 削除の結論自体は正しいが、根拠を訂正する。当初「`workspace-shell-restructure/overview.md` §6-5 の `reviewTagId` 廃止」を根拠に挙げていたが、§6-5 が廃止したのは Review パネルのタグ絞り込み `Select` であって、タグ詳細ダッシュボードではない。正しい根拠は「**`TagDetailPage` がソースから既に削除済みで、procedure が呼び出し元ゼロの孤児になっている**」こと（plan-critic が `app/api/mcp` を含め非 server 参照ゼロを実測確認済み）。

| 対象                                                                                                                                                                                                                                                 | 根拠                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/timeblock/server/tag-statistics.ts`（`tagStatisticsRouter`、`getTagDashboard` procedure）                                                                                                                                                  | `TagDetailPage` がソースから既に削除済み。client 側の呼び出しがゼロ（`rg` で `.getTagDashboard\b` の非server参照なし、MCP 含む）。`GlobalOverlays.tsx:108-116` の `handleViewStats` は `tagId` を受け取っても `void tagId` するだけで `/report` へ遷移するのみ。`useTimeblockContextActions.ts:38-45` も同様に `/report` 遷移のみで dashboard を開かない                                                                                                                                                  |
| `features/timeblock/server/statistics-tag-dashboard-service.ts`（`StatisticsTagDashboardService`）                                                                                                                                                   | 上記の唯一の呼び出し元                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `features/timeblock/domain/tag-dashboard.ts`（`buildTagDashboard`）                                                                                                                                                                                  | 上記の唯一の呼び出し元                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `router-index.ts` の `tagStatisticsRouter` merge                                                                                                                                                                                                     | 上記削除に伴い不要化                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `statistics-service.ts` の `getTagDashboard` facade メソッドと `TagDashboardInput` import                                                                                                                                                            | 同上                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `features/timeblock/server/statistics-general-router.ts` の `getTimeByTag` procedure、`statistics-general-service.ts`/`statistics-service.ts` の facade、`statistics-time-by-tag-transform.ts`、`statistics-row-builders.ts` の `buildTimeByTagRows` | **plan-critic の指摘で§3-C から移動**。`timeByTag` は `features/review/types/metrics.types.ts:95` の型定義・`ReviewMetricsGrid.stories.tsx` の空配列 fixture・`statistics-shared.ts:91` の型にしか現れず、`useReviewMetrics.ts` は一切参照しない。procedure `statistics.getTimeByTag` の client 呼び出しもゼロ（`docs/engineering/timezone.md` のサンプルコードのみ）。`getStatsPageData` の `StatsPageData`/`metrics.types.ts` の `timeByTag` フィールドも合わせて削除する（RPC の JSON 自体は触らない） |

### 3-B. 機械的置換（activity 版がすでに存在し、実装パターンも先例あり）

| 対象                                                                                 | 置換先                                                                                    | 根拠                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/review/components/time-pl/TimePLTagMarker.tsx` の `TagIcon`                | `features/activities/components/ActivityIcon.tsx`                                         | props は既に `categoryIcon`/`categoryColor`。`TagIcon` を汎用 icon+color レンダラーとして借用しているだけで tag 固有ロジックへの依存なし                                                                                                                                                                                         |
| `features/review/domain/timePL/types.ts` の `TagColorName`                           | `features/activities/lib/category-colors.ts` の `CategoryColorName`                       | 同一 10 色パレット、実装ほぼ同一                                                                                                                                                                                                                                                                                                 |
| `features/review/hooks/useTimePLData.ts` の `resolveTagColor`                        | `resolveCategoryColor`                                                                    | 引数は既に `categoryColor`（activity 由来）                                                                                                                                                                                                                                                                                      |
| `features/review/components/diff/ReviewDiffPanel.tsx` の `useTagsMap()`/`getTagById` | `features/activities/hooks/useActivitiesMap.ts` の `useActivitiesMap()`/`getActivityById` | 戻り値 shape がほぼ同形（`{id,name,categoryId,categoryName,color,icon}`）。MCP `review-get.ts` が `tags.listArchived` → `activities.listActivities({includeArchived:true})` へ既に同型移行済みの先例あり                                                                                                                         |
| `features/timeblock/server/tag-assignment-guard.ts` の `assertTagAssignable`         | 書き込み経路ごと閉じる（下記手順）                                                        | plan-critic 実測で訂正: 「UI に tag picker が無い」は「書き込み経路が無い」を意味しない。`schemas/timeblock.ts` の 4 schema すべてに `tagId` が今も生きており、`plan-guards.ts` が `updateData.tag_id = input.tagId` を今も書く。`protectedProcedure` は認証済みセッションから直接叩ける tRPC API なので UI 不在は境界にならない |

**§3-B guard 削除の正しい手順（plan-critic 指摘を反映）**: guard だけを先に外すと、#1576 で決めた「アーカイブ済みタグは API 経由でも付与拒否」という現役の保護がすり抜ける穴になる（`workflow.md` §同型指摘の打ち切り の「点を塞ぐより class を閉じる」に従う）。同一 commit 内で次の順に実施する。

1. `schemas/timeblock.ts` の 4 schema（`createPlanSchema`/`updatePlanSchema`/`createRecordSchema`/`updateRecordSchema`）から `tagId` を削除する
2. `plan-guards.ts` の `tag_id` 代入行、record 側の同等箇所を削除する
3. **呼び出し元を正確に列挙する**（plan-critic が発見した記載漏れを反映）: `plan-service.ts`（165,166,209,215行目）、`record-service.ts`（152,153,200,206行目）に加え、**`timeblock-command-service.ts`（59,80,83,152,174,177行目）**にも `assertTagAssignable`/`assertActivityAssignable` の呼び出しがある。1-2 の結果 `assertTagAssignable` への到達経路が無くなったことを確認してから、これらすべての呼び出し箇所と関数定義を削除する
4. MCP 経路（`mcp-mutation-client.ts:259-297,347-384`）は実測で安全（`p_tag_id: null`／`p_tag_id_present: false` を常に固定送出）なので追加対応不要

**あわせて直す既知の隣接バグ（同一箇所の変更なので同 commit に含める）**: `ReviewDiffPanel.tsx:147` の `tag ? var(--tag-${tag.color}) : item.color` の `item.color` フォールバックは `useCalendarData.ts` で常に空文字にセットされており実質死んでいる。`tagId` が null で `activityId` がある diff item（Step 4 cutover 後に作られたブロック）は**現在色バーが付かない**。activity 化と同時にこの欠落も解消する（新しいバグを作らないために必須の随伴修正であり、scope 拡大ではない）。

### 3-C. 新規実装が必要（activity 版が存在しない、現役機能）

`getTimeByTag` は plan-critic の実測で消費者ゼロと判明したため §3-A（削除）へ移動した。新規実装は残り 2 本。

| 対象                                                                                                                                                         | 現在の消費者                                                                                                                                                                                                                                     | 備考                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `domain/estimation-accuracy.ts` の `aggregatePlanRecordEstimationAccuracy`                                                                                   | `statistics-kpi-service.ts` の `getEstimationAccuracy`（`proProcedure`）、`getStatsPageData` の `estimationAccuracy`/`prevEstimationAccuracy` → `ReportBody.tsx:160` 経由で `WeeklyReflectionPanel` の `EstimationBiasRow` へ供給（**現役 UI**） | `tag_id` が null の plan を「未分類」バケットへ畳む既存ロジック（§1576）を activity 版でも維持する |
| `domain/tag-estimation-factor.ts` + `hooks/useTagEstimationFactors.ts` + `statistics-feedforward-service.ts` + `components/editor/EstimationFeedforward.tsx` | `TimeblockInspectorForm.tsx:643`                                                                                                                                                                                                                 | **見積もりキャリブレーション本体（ADR-026）。★最優先で直す — 現在おそらく機能停止中**              |

## 4. 見積もりキャリブレーションの regression 疑いと対応方針

### 4-1. 実測した状況証拠

- `TimeblockInspectorForm.tsx` の分類選択 UI は Step 4 cutover で `ActivityFieldRow`（`selectedActivity`/`handleActivityChange`）へ完全移行済み。tag picker（`TagRow.tsx`）は既に存在しない
- 新規 Plan 作成時、フォーム state の `tagId` は `duplicateDraft?.tagId ?? target?.tag_id ?? null` で初期化される（194行目）。新規作成（複製でも既存編集でもない場合）は常に `null`
- `EstimationFeedforward` は `tagId={value.tagId}` を受け取り、`tagId` が null なら何も表示しない設計（`project(tagId, draftMinutes)` が null を返す）
- 結論: **Step 4 cutover（本番反映日を確定: [PR #2202](https://github.com/Dayopt/dayopt/pull/2202) が 2026-08-18 18:11 JST に merge。commit `63fbd9ddb`/`a55e0b4aa` も同日）以降に作成された新規 Plan では、見積もりキャリブレーションの表示条件が構造的に満たされない**。これは Step 5 未完了に伴う既存の劣化であり、本 plan がこれから作るリグレッションではない

### 4-2. 対応方針（保守的デフォルトを推奨、CHECKPOINT は状況証拠の確度確認のみ）

ADR-026 は「Plan 側の `tag_id` で束ねる」という非対称ルール（Record 側優先の Review 表示とは異なる意図的な決定）を明記している。activity 化にあたり、**集計の意味論（Plan 側で束ねる・直近4週中央値・n>=3 閾値・28日窓）は変更せず、キーだけ `tag_id` → `activity_id` に置換する**。

- 保守的デフォルトを推奨する理由: activity は tag より粒度が細かくなりうるため n>=3 到達率が下がる懸念があるが、**現状（tagId が常に null）は 100% 表示されない**状態なので、機械的置換だけで確実に regression から回復する。窓・閾値の調整は実データでの分布を見てから判断すべきで、今回の PR で同時に変えると「移行の効果」と「閾値変更の効果」が切り分けられなくなる
- **回復は即時ではない（plan-critic 指摘を反映）**: cutover は 2026-08-18 merge、本 plan の実装時点は 2026-08-20 で **cutover から 2 日しか経っていない**。28日窓（直近4週）は cutover 以降に作られた activity 付き Plan/Record でしか埋まらないため、**置換直後は n>=3 にほぼ到達せず、窓が実質的に埋まるまで数週間かかる**。「機械的置換で確実に regression から回復する」は方向として正しいが、体感できる回復までに時間差があることを plan として明記し、「置換すれば直る」という過度な期待を作らない
- **検証方法を本番寄りに修正（plan-critic 指摘を反映）**: ローカル Supabase (`pnpm test:integration`) は `db:seed` の合成データで本番の activity 粒度・利用頻度分布を反映しないため、n>=3 到達率の実態を判定する証拠にならない。実装後は以下の順で確認する
  1. `pnpm test:integration` はロジックの正しさ（集計の意味論が activity 版でも保存されているか）の確認に限定する
  2. 本番の実分布確認は **この PR をブロックしない**。デプロイ後 2〜4 週の期間を置いて、Sentry / 本番ログでの観測、または `supabase`(cloud, `--read-only`) をオンデマンド登録した 1 クエリ（`.claude/rules/mcp-usage.md` 参照）で activity 別の有効サンプル数分布を確認する follow-up タスクとして扱う
  3. 著しく機能しなさそうなら follow-up issue で閾値見直しを提起する（この PR では変更しない）

## 5. Existing Code to Reuse

- `features/activities/hooks/useActivitiesMap.ts`（`useActivitiesMap`/`getActivityById`）
- `features/activities/components/ActivityIcon.tsx`
- `features/activities/lib/category-colors.ts`（`resolveCategoryColor`/`getCategoryColorClasses`/`CategoryColorName`）
- `features/timeblock/server/statistics-activity-axis-builders.ts` と `domain/activity-axis-aggregation.ts` の集計パターン（`aggregateByActivity`）を §3-C の新規実装 2 本のテンプレートとして使う
- `features/timeblock/server/tag-assignment-guard.ts` の `assertActivityAssignable`（既存）
- `app/api/mcp/_tools/review-get.ts` の `tags.listArchived` → `activities.listActivities({includeArchived:true})` 移行パターン（ReviewDiffPanel 移行の先例）

## 6. What I'm Not Doing

- **DB の `plans.tag_id` / `records.tag_id` 列・関連 RPC 引数の drop はしない**（#2175、EXPLICIT AUTHORITY、別 PR）。additive-only のまま残す
- **見積もりキャリブレーションの集計ロジック（窓・閾値・中央値・Plan側優先）を変更しない**。キーの置換のみ（§4-2）
- **`--tag-*` → `--category-*` design token のリネームは本 plan に含めるが、独立 commit にする**（§7 Step 6 参照）。plan-critic 実測により、token 定義（`packages/foundations/src/tokens/colors.css`/`tailwind-theme.css`）は `features/activities/lib/category-colors.ts` が `var(--tag-${name})`/`bg-tag-${name}` を生成する形で**現役の activity 配色経路そのもの**を支えており、`features/tags` 撤去とは blast radius が別物（token リネームを誤ると activity の色が消える）。同じ Step にまとめるが commit は分離し、revert 単位を明確にする
- **タグ CRUD・階層・マージ機能の復活はしない**（Step 7 で既に決着済み）
- **`tag-stats.ts` の汎用化リネーム（`tag_id` → `entityId` 等）は必須にしない**。既に activity 版と共有されており機能上問題ないため、リネームは余裕があれば行う程度に留める（ついでリファクタの回避）

## 7. Reversibility Table

前提: tRPC 入力 schema（`schemas/timeblock.ts`）から `tagId` を除去済みであること（§3-B Step 2 の必須成果物）。除去前は `assertTagAssignable` を単純に外す変更が保護穴を開けるため `[minutes]` 前提が成立しない。

| Step | 内容                                                                                                | Reversibility                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | タグダッシュボード一式 + `getTimeByTag` 削除（§3-A）                                                | `[minutes]`                                                                                                           |
| 2    | schema から `tagId` 除去 + guard 書き込み経路を閉じる + TimePL/ReviewDiffPanel の機械的置換（§3-B） | `[minutes]`                                                                                                           |
| 3    | `getEstimationAccuracy` の activity 軸版新規実装 + `WeeklyReflectionPanel` 切替                     | `[minutes]`                                                                                                           |
| 4    | 見積もりキャリブレーションの activity 軸版 + regression 確認                                        | `[minutes]`（DB 列は触らない）                                                                                        |
| 5a   | `features/tags` 全体・`tag-filter/` 撤去（#2218 完了）                                              | `[minutes]`（commit 単位で revert 可能。DB 非依存）                                                                   |
| 5b   | `--tag-*` → `--category-*` design token リネーム（**独立 commit、PR 最終 commit に配置**）          | `[minutes]`（ただし revert 単位は 5a と別。誤ると activity 配色が壊れるため、この 1 commit だけを切り戻せる形にする） |

`[irreversible]` 要素なし（DB drop は本 plan のスコープ外のため）。

## 8. 検証

- **初回 push 前に read-only subagent 3 本を必須で挟む**（`workflow.md` §push 前の敵対的セルフレビュー）: `risk-reviewer`（guard 削除・書き込み経路変更の反証）、`architecture-guard`（`features/tags` 撤去に伴う `eslint.config.mjs` Layer 0 ブロック削除・barrel 依存方向）、`behavior-verifier`（集計意味論の同値性 — Plan 側で束ねる・中央値・n>=3・28日窓が activity 版でも保存されているか、tRPC procedure 削除の影響）
- 各 Step 後 `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries`
- Step 3〜4 完了後 `pnpm test:run` + 対象 service の既存 test 更新（tag版 test を activity 版へ差し替え、tag版はそのまま残す場合は理由を明記）
- Step 5b（token リネーム）完了後 `pnpm lint:tokens` + `pnpm check:workspace`（typecheck + build:packages + build-storybook。`packages/foundations/src/tokens/Colors.stories.tsx` と `packages/components/src/inputs/checkbox.stories.tsx` が `--tag-*` を参照しているため）
- Step 5a 完了後 `pnpm quality:deadcode`（knip）で `features/tags` 配下の孤児化残骸を確認
- `rg --hidden --glob '!.git/**' "features/tags"` で残存参照を実測し、`calendar-prefetch.ts` 以外に呼び出し元が無いことを確認してから feature ディレクトリ撤去に進む
- Step 5 完了後、doc 側の追従漏れを確認する（`.claude/rules/feature-boundaries.md` §階層モデル（DAG） の Layer 0 表に `activities` を追記、`docs/engineering/conventions-api.md:405` のタグ別集計記述を更新。`feature-boundaries.md` 自身が「source of truth は `eslint.config.mjs`」と明記しているとおり `eslint.config.mjs` 側を先に直してから追従させる）
- Step 4 完了後は §4-2 の方針どおり本番実測を this-PR 外の follow-up として扱う（ローカル Supabase の `pnpm test:integration` はロジック正しさの確認に限定）
- UI 変更（ReviewDiffPanel の色バー、TimePL マーカー、EstimationFeedforward 表示）は共有 browser surface で視覚確認（`workflow.md` §Storybook 視覚確認）

## 9. 関連

- [overview.md](./overview.md) — Step 5/7 の元設計
- [#2247](https://github.com/Dayopt/dayopt/issues/2247) / [#2218](https://github.com/Dayopt/dayopt/issues/2218) — 本 plan の対象 issue
- [workspace-shell-restructure/overview.md §6-5](../workspace-shell-restructure/overview.md) — Review パネルのタグ絞り込み `Select` 廃止の確定済み設計（§3-A の隣接根拠。タグ詳細ダッシュボード自体の根拠は `TagDetailPage` 削除済み + 呼び出し元ゼロの実測）
- [#2175](https://github.com/Dayopt/dayopt/issues/2175) — DB destructive migration（本 plan のスコープ外）
- [PR #2202](https://github.com/Dayopt/dayopt/pull/2202) — Step 4 cutover 本番反映（2026-08-18 merge、§4-2 の起点）
