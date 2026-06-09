# review-granularity-redesign: 粒度適応型 Review 全体設計

> **策定日**: 2026-06-10
> **ステータス**: 設計確定待ち（実装は Step ごとに後続 plan を切る）
> **スコープ**: `/review` メインページの粒度別 composition 再設計。タグ詳細ページ（`/review/tags/[tagId]`）は対象外
> **前提**: 2026-05-01 の `/stats` 4 タブ → `/review` 単一ページ集約（タブ再導入はしない）

## 章立て

1. [Context](#1-context)
2. [現状評価](#2-現状評価)
3. [設計原則](#3-設計原則)
4. [共通フレーム](#4-共通フレーム)
5. [粒度別構成](#5-粒度別構成)
6. [既存資産マップ](#6-既存資産マップ)
7. [実装ロードマップ](#7-実装ロードマップ)
8. [Not Doing](#8-not-doing)
9. [未決事項（各 Step plan で確定）](#9-未決事項各-step-plan-で確定)

---

## 1. Context

Review ページは 5 月に Stats 4 タブ構成（Review / Progress / Insights / Badges）を `/review` 単一ページに集約した。現在は粒度切替（日/週/月/年）+ DateNavigator をヘッダーに持ち、全体サマリー（`ReviewView`）とタグ詳細ページで構成される。

このページの中身を本格的に作り込むにあたり、「dayopt としてあるべき Review の構成」をゼロベースで確定するのが本設計書の目的。構成方針は **粒度適応型**（granularity ごとに composition を切り替える）で確定済み（2026-06-10 ユーザー合意）。

### dayopt における Review の位置づけ

ユーザージャーニー: Plan（Calendar で計画）→ Track（実績記録）→ **Review（振り返り）** → Improve（次の計画に反映）。

Review はこのループの折り返し地点。dayopt の差別化はタイムボクシング × 時間記録の一体化、すなわち **planned / actual の 2-layer model** にある。Toggl は actual しか持たず、Google カレンダーは planned しか持たない。両方を持つ dayopt だけが「計画と現実のずれ」を見せられる。Review はこの差別化データを最も濃く展示する場所として設計する。

---

## 2. 現状評価

### 良い点（維持する）

- **単一ページ + 粒度切替の骨格**: 5 月のタブ廃止判断と整合。ナビゲーション構造は変えない
- **データ層の先行整備**: `getTimePL` / `getHourlyDistribution` / `getDayOfWeekDistribution` / `getEstimationAccuracy` / `getDailyHours` / `getStreak` 等 15+ procedure が実装済み。Insights タブ削除後、**UI から使われていない資産が多い**（§6 参照）
- **インフラ**: URL 同期（`?g=&d=`）、SSR prefetch + HydrationBoundary、タグスイッチャー（#1280）、`useReviewFilterStore` の粒度・日付状態管理

### 課題（本設計で解決する 4 点）

| #   | 課題                       | 詳細                                                                                                                                                                                     |
| --- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **全粒度で同一レイアウト** | 日次で「空き時間」の大きな数字は意味が薄く、年次でタグ別詳細リストは重い。粒度ごとに答えるべき問いが違うのに、同じカード群（サマリー 3 枚 + タグ別 + Time P/L + 空き時間）を見せている   |
| P2  | **差別化データが脇役**     | Time P/L（計画 vs 実績）が右カラムの 1 カード。主役は「記録時間合計 + トップタグ」という Toggl でも見られる指標。さらに Storybook には 6 種の Time P/L view が実装済みなのに製品で未使用 |
| P3  | **研究者の所見が不在**     | copywriting.md が約束する「週次の 1-2 文所見」がない。`ruleInsights.ts`（閾値・トレンドの純粋関数）は実装済みだが Review ページに接続されていない                                        |
| P4  | **Improve への還流がない** | Review から Calendar（次の計画）へ戻る導線が存在せず、Plan → Track → Review → Improve のループが Review で行き止まりになる                                                               |

---

## 3. 設計原則

### 原則 1: 粒度 = 問いの違い

粒度切替は「同じデータのズーム」ではなく「別の問いへの切替」として扱う。

| 粒度 | ユーザーの問い                 | ビューの性格                      |
| ---- | ------------------------------ | --------------------------------- |
| 日   | 今日は計画どおりだったか       | Daily Close（1 日の締め）         |
| 週   | 時間をどこに使い、どうずれたか | Weekly Review（振り返りの主戦場） |
| 月   | どんな傾向・習慣があるか       | Patterns（パターン分析）          |
| 年   | 時間の地図はどう描かれたか     | Map Overview（俯瞰）              |

デフォルト粒度は週（現状維持）。**週次ビューが最重要**で、設計・実装の優先度も週 → 日 → 月/年。

### 原則 2: Time P/L を主役にする

計画 vs 実績は dayopt にしかないデータ。週次ビューの最上位セクションに据え、日次でもタイムライン比較として主役にする。「記録合計」はKPI 行の 1 指標に降格する。

### 原則 3: 研究者の所見を 1 スロット

copywriting.md の人格（寡黙な研究者）に従い、各ビューの冒頭に rule-based の所見を最大 1〜2 文表示する。`evaluateRuleInsights`（閾値 + 前期間比トレンド、severity 順、maxResults 制御）を流用。データ不足時は何も言わず数字だけ見せる（沈黙も人格の一部）。AI 生成は使わない（§8）。

### 原則 4: Calendar への還流導線

各ビューの末尾（または空白の発見箇所）に「次の計画へ」の導線を 1 つ置く。Tier 2 行動 CTA（具体的な行動動詞、Secondary ボタン）。1 画面 1 導線まで。

### 原則 5: 比較対象は過去の自分のみ

KPI には常に「前の同期間」（前日/先週/先月/昨年）との比較を添える。`computePreviousDateRange` が既にこの計算を持つ。マイナス時は数字で追い討ちしない（copywriting.md の数字フレーミング準拠）。

---

## 4. 共通フレーム

全粒度で共有するページ骨格。ヘッダー（粒度切替 + DateNavigator）は現状から変更しない。

```
┌─ ReviewLayout（既存、変更なし）────────────────┐
│ 粒度切替 + DateNavigator                        │
├────────────────────────────────────────────────┤
│ ① 所見スロット（rule-based 1-2 文、なければ非表示）│
│ ② KPI 行（粒度別 3 指標、前の同期間比付き）        │
│ ③ 粒度固有セクション（§5）                       │
│ ④ 還流導線（Calendar へ、Tier 2 CTA × 1）        │
└────────────────────────────────────────────────┘
```

実装イメージ（Step 1 で骨格化）:

```tsx
// ReviewView を granularity dispatch に再編（擬似コード）
export function ReviewView() {
  const granularity = useReviewFilterStore((s) => s.granularity);
  switch (granularity) {
    case 'day':
      return <DailyReview />;
    case 'week':
      return <WeeklyReview />;
    case 'month':
      return <MonthlyReview />;
    case 'year':
      return <YearlyReview />;
  }
}
```

①②④ は `InsightSlot` / `KpiRow` / `NextActionLink` のような共有 component として `features/review/components/shared/` に置き、各粒度ビューが合成する。粒度ビュー間でセクション component を直接共有してよい（例: タグバランスは週・月で同一 component）。

---

## 5. 粒度別構成

### 5.1 日（Daily Close）— 「今日は計画どおりだったか」

1 日の終わりに 1〜2 分で締める体験。情報量は最小、視覚比較が主役。

| 順  | セクション                       | 内容                                                                                                  | データソース                                       |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| ①   | 所見                             | estimation_bias / deep_hour 系 micro insight（`MicroInsightType` 流用）                               | `getTimePL` + 既存 derivers                        |
| ②   | KPI 行                           | 記録時間 / 計画消化率 / 充実度平均（前日比）                                                          | `getTimePL` / `getAvgFulfillment`                  |
| ③   | **計画 vs 実績ミニタイムライン** | 左=planned、右=actual の 2 列縦タイムライン。ずれ（開始遅れ・延長・未実施）が一目でわかる。日次の主役 | entries の planned/actual 2-layer（要設計: §9-Q1） |
| ③'  | 未記録の空白帯                   | タイムライン上の空白をそのまま見せ、タップで Calendar の該当時刻へ（記録しに行く導線を兼ねる）        | 同上                                               |
| ④   | 還流導線                         | 「明日の計画を立てる」→ Calendar 翌日表示                                                             | —                                                  |

### 5.2 週（Weekly Review）— デフォルト・最重要

振り返りの主戦場。Time P/L を最上位に昇格させる。

| 順  | セクション           | 内容                                                                                                                                                                                         | データソース                                               |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| ①   | 所見                 | `evaluateRuleInsights`（閾値 + 先週比トレンド）から severity 最上位の 1 件                                                                                                                   | `getStatsPageData` の KPI 群                               |
| ②   | KPI 行               | 記録時間（先週比）/ 計画達成率 / トップタグ                                                                                                                                                  | `getStatsPageData` / `getTimePL`                           |
| ③   | **Time P/L（主役）** | タグ別の予算 vs 実績。Storybook 実装済みの 6 view（statement / waterfall / barComparison / stacked / breakEven / balanceSheet）から採用 view を選定（§9-Q2）。超過・未達タグのハイライト含む | `getTimePL` + `TimePLContainer` + `domain/timePL/derivers` |
| ④   | 週のリズム           | 曜日 × 時間帯の分布（自分の集中パターンの可視化）                                                                                                                                            | `getHourlyDistribution` + `getDayOfWeekDistribution`       |
| ⑤   | タグバランス         | 既存 `TagBreakdownBar` + タグ別リスト（先週比を添える）。タグ詳細への入口                                                                                                                    | `getTimeByTag` / `getStatsPageData`                        |
| ⑥   | 還流導線             | 「来週の計画を立てる」→ Calendar 翌週表示                                                                                                                                                    | —                                                          |

### 5.3 月（Patterns）— 「どんな傾向・習慣があるか」

週より一段抽象化し、傾向と習慣を見せる。

| 順  | セクション       | 内容                                                                            | データソース                                        |
| --- | ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| ①   | 所見             | 月内トレンド（先月比）から 1 件                                                 | `getStatsPageData`                                  |
| ②   | KPI 行           | 記録時間（先月比）/ 記録日数 / 見積精度                                         | `getStatsPageData` / `getEstimationAccuracy`        |
| ③   | 月間推移         | 日別バー（月内の波）                                                            | `getDailyHours` or `getStatsPageData` 時系列        |
| ④   | タグ構成の推移   | 週ごとのタグ構成積み上げ（配分の変化）                                          | `getTimeByTag` 週分割 or `getMonthlyTrend`（§9-Q3） |
| ⑤   | 見積精度トレンド | 見積 vs 実績の精度推移（タグ詳細の `TagAccuracyTrendChart` パターンを全体版に） | `getEstimationAccuracy`                             |
| ⑥   | 記録習慣         | 記録日数 / ストリーク（指標として表示。gamification 化はしない）                | `getStreak`                                         |
| ⑦   | 還流導線         | 「来月の計画を立てる」→ Calendar                                                | —                                                   |

### 5.4 年（Map Overview）— 「時間の地図の俯瞰」

「1 年分の時間の地図」（copywriting.md のメタファー）を体現する俯瞰ビュー。詳細リストは置かない。

| 順  | セクション           | 内容                                                                       | データソース                  |
| --- | -------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| ①   | 所見                 | 年間ハイライト 1 件（最も時間を使ったタグ等の事実提示）                    | `getTimeByTag`                |
| ②   | KPI 行               | 総記録時間（昨年比）/ 記録日数 / 最長ストリーク                            | `getDailyHours` / `getStreak` |
| ③   | **年間ヒートマップ** | GitHub 草スタイルの日別記録量。年次の主役                                  | `getDailyHours`               |
| ④   | 月別推移             | 12 ヶ月の記録時間バー                                                      | `getMonthlyTrend`             |
| ⑤   | 年間タグ構成         | タグ別構成比（上位のみ）                                                   | `getTimeByTag`                |
| ⑥   | 還流導線             | なし（年次は俯瞰で完結。④の導線は粒度 1 つまでの原則を年次では適用しない） | —                             |

### 5.5 タグ詳細ページ（対象外）

`/review/tags/[tagId]` は直近で刷新済み（Hero / 精度トレンド / 時間帯 / 曜日 / 充実度 / 直近ブロック + タグスイッチャー #1280）。本 project では触らない。週次ビューのタグバランス（⑤）からの遷移先として機能し続ける。

### 5.6 モバイル

各粒度ビューは 1 カラム縦積みで同じセクション順を保つ。`ReviewTagChipRow`（下部固定チップ）と `MobileReviewHeader` は現状維持。日次のミニタイムラインはモバイルでも 2 列を維持する（幅が許す最小構成にする。詳細は Step 3 plan で確定）。

### 5.7 Free / Pro 境界（今回は設計しない）

課金境界は本 project では設計しない（2026-06-10 ユーザー合意）。ただし後から Pro 化を判断できるよう、§6 の資産マップに各ビュー × 使用 procedure の対応を整理しておく。現行の `proProcedure` ガードはそのまま（UI 側の出し分けは作らない）。

---

## 6. 既存資産マップ

後から Pro 化判断する際の情報基盤を兼ねる。「未使用」= 実装済みだが現在の製品 UI から参照されていない資産。

### 6.1 tRPC procedures（`features/entry/server/`）

| Procedure                                                   | 返すもの                        | 現ガード | 現 UI 使用 | 本設計での使用先                                       |
| ----------------------------------------------------------- | ------------------------------- | -------- | ---------- | ------------------------------------------------------ |
| `getStatsPageData`                                          | 統合統計（概要 + 時系列 + KPI） | Pro      | ✅         | 週② / 月①②③                                            |
| `getTimePL`                                                 | タグ別予算 vs 実績              | Pro      | ✅（脇役） | **日①②③ / 週③（主役）**                                |
| `getTimeByTag`                                              | タグ別時間集計                  | Free     | ✅         | 週⑤ / 月④ / 年①⑤                                       |
| `getStreak`                                                 | 連続記録日数                    | Free     | ✅         | 月⑥ / 年②                                              |
| `getDailyHours`                                             | 日別時間（年間）                | Free     | ✅         | 月③ / 年③                                              |
| `getHourlyDistribution`                                     | 時間帯別分布                    | Pro      | ❌ 未使用  | 週④                                                    |
| `getDayOfWeekDistribution`                                  | 曜日別分布                      | Pro      | ❌ 未使用  | 週④                                                    |
| `getMonthlyTrend`                                           | 月別トレンド（12 ヶ月）         | Pro      | ❌ 未使用  | 年④                                                    |
| `getEstimationAccuracy`                                     | 見積精度 KPI                    | Pro      | ❌ 未使用  | 月②⑤                                                   |
| `getAvgFulfillment`                                         | 平均充実度                      | Pro      | ❌ 未使用  | 日②                                                    |
| `getEntryRate`                                              | エントリ率 KPI                  | Pro      | ❌ 未使用  | 所見の入力（週①）                                      |
| `getBlankRate`                                              | 空き時間率                      | Pro      | ✅         | 日③'（空白帯）                                         |
| `getEnergyMap` / `getContextSwitches` / `getCumulativeTime` | エネルギー分布 / CS 数 / 累積   | Pro      | ❌ 未使用  | **本設計では使わない**（所見の将来入力候補として保持） |

> **制約**: 新規 RPC は作らない。上記で構成できる範囲に設計を収める。実装中に不足が判明したら該当 Step の plan で個別判断する。唯一の例外候補は日次タイムライン（§9-Q1）。

### 6.2 components / lib（`features/review/`）

| 資産                                                                                | 現状                             | 本設計での使用先                            |
| ----------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------- |
| `components/time-pl/`（`TimePLContainer` + 6 views + Shell）                        | **Storybook のみ、製品未使用**   | 週③ の主役（view 選定は §9-Q2）             |
| `domain/timePL/derivers.ts`                                                         | 使用中（`deriveStatement` のみ） | 週③ / 日②（全 deriver を活用）              |
| `lib/ruleInsights.ts`（`evaluateRuleInsights`）                                     | **実装済み・未接続**             | 週① / 月① の所見                            |
| `lib/microInsights.ts`（`MicroInsightType`）                                        | 型定義のみ                       | 日① の所見                                  |
| `components/review/TagBreakdownBar.tsx`                                             | 使用中                           | 週⑤                                         |
| `components/metrics/MetricCard.tsx`                                                 | Storybook あり                   | KPI 行（全粒度②）                           |
| `components/tag-detail/TagHourlyChart.tsx` / `TagDowChart.tsx`                      | タグ詳細で使用中                 | 週④ の全体版の参考実装（タグ→全体に一般化） |
| `components/tag-detail/TagAccuracyTrendChart.tsx`                                   | タグ詳細で使用中                 | 月⑤ の参考実装                              |
| `lib/compute-date-range.ts`（`computeStatsDateRange` / `computePreviousDateRange`） | 使用中                           | 全粒度の期間・前期間計算（変更不要）        |
| `lib/prefetch.ts`                                                                   | 週粒度前提で 4 クエリ prefetch   | 粒度別 prefetch に拡張（Step 1）            |
| `stores/useReviewFilterStore.ts`                                                    | 使用中                           | 変更不要                                    |

---

## 7. 実装ロードマップ

各 Step は独立した後続 plan として起案する（本設計書は構成の拠り所）。workflow.md の規模判定では project 全体は大規模、各 Step は小〜中規模。

| Step | 内容                                                                                                                                                                                          | 規模目安 | 依存     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| 1    | granularity dispatch 骨格 + 共通フレーム（`InsightSlot` / `KpiRow` / `NextActionLink`）。既存レイアウトを `WeeklyReview` として一旦全粒度から参照（見た目の regression ゼロで構造だけ入れる） | 中       | —        |
| 2    | **Week view**: Time P/L 主役化（view 選定込み）、KPI 行、所見接続、週のリズム、還流導線                                                                                                       | 大       | Step 1   |
| 3    | **Day view**: 計画 vs 実績ミニタイムライン、空白帯 → Calendar 導線                                                                                                                            | 中〜大   | Step 1   |
| 4    | **Month / Year view**: 月間推移・タグ構成推移・見積精度 / 年間ヒートマップ・月別推移                                                                                                          | 中       | Step 1   |
| 5    | 磨き込み: 所見ルールの粒度別調整、i18n 文言の copywriting 監修、prefetch 最適化、Storybook / E2E 整備                                                                                         | 中       | Step 2-4 |

共通ゲート（全 Step）: `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries`、UI 変更は Storybook 視覚確認（Tomoya）+ Playwright スクリーンショット、i18n キー追加時は `lint:i18n`。

---

## 8. Not Doing

- **タブ / 複数ページ構成の再導入** — 2026-05-01 の単一ページ集約決定を尊重。粒度適応は同一 URL（`?g=` クエリ）内の composition 切替で実現する
- **AI レポート** — AI 生成レポートはやらない方針が決定済み（2026-06-10 確認）。所見は rule-based のみ。AI 連携の拡張ポイントも設計しない
- **Free / Pro の出し分け UI** — 課金境界は今は考えない。§6 の資産マップで後から判断できる情報だけ揃える
- **Badge / gamification の再導入** — 2026-05-01 に完全削除済み。ストリークは月次・年次の一指標としてのみ扱う
- **新規 DB schema / 新規集計 RPC** — 既存 procedure で構成できる範囲に限定（YAGNI）。例外候補は §9-Q1 のみ
- **タグ詳細ページの改修** — 直近で刷新済み（#1280）。週次⑤からの遷移先として現状維持
- **エネルギーマップ / コンテキストスイッチの UI 復活** — Insights タブ削除時に UI を落とした指標。所見の入力候補として procedure は保持するが、専用セクションは作らない（必要性がユーザーフィードバックで立証されてから）

---

## 9. 未決事項（各 Step plan で確定）

| #   | 事項                                                                                                                                                                          | 確定タイミング |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Q1  | 日次ミニタイムラインのデータ取得: 既存 `entries.list` 系で planned/actual を引けるか、軽量な専用 query が要るか（「新規 RPC を作らない」制約の唯一の例外候補）                | Step 3 plan    |
| Q2  | 週次 Time P/L の採用 view: 6 種（statement / waterfall / barComparison / stacked / breakEven / balanceSheet）から製品採用を 1 つ選定。残りは Storybook 資産として保持 or 削除 | Step 2 plan    |
| Q3  | 月次「タグ構成の推移」の集計単位: `getTimeByTag` を週ごとに 4-5 回引くか、`getStatsPageData` の時系列で賄うか                                                                 | Step 4 plan    |
| Q4  | 週のリズム（週④）の表現: 曜日 × 時間帯ヒートマップ 1 つに統合 or 曜日バー + 時間帯バーの 2 つ並列                                                                             | Step 2 plan    |
