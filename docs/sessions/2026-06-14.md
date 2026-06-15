date: 2026-06-14
commits: 4
areas: [review, entry, chronotype, calendar]

decisions:

- 年次・月次 Review ビューを削除。「眺めて終わる」ダッシュボードは Review の本義（振り返り → 次の行動）と乖離。粒度を日/週に絞る
- EstimationAccuracy（タグ別見積精度）は週次 Review へ移設。計画のデフォルト値に影響する唯一のセクションのため存続させる
- 充実度（fulfillment_score）をコード側から全削除。ゼロ入力哲学と衝突する第二の意思決定（5段階評価）を確認フローから除去
- DB カラム drop は後続の migration PR で行う（コード削除 → deploy → drop の順序を遵守）
- chronotype / Deep Zone を全削除。集中時間帯は事前の自己申告ではなく実績データから事後観測すべきもの。宣言型はウェルネス化ベクトル＋オンボーディング重さ違反

breaking:

- features/chronotype 全体を削除（quiz / settings / gradient / zones / store / tests）
- ReviewGranularity を 'day' | 'week' に縮約（'month' / 'year' を除去）
- EntryInspectorForm から FulfillmentRow を削除
- deepUtilization メトリクスを削除（review/lib/metrics.ts / metricDefinitions / ruleInsights）
- useTagBalanceRows / tzMonthStart / tzMonthEnd を削除（孤児化）
- MonthlyReview.tsx / YearlyReview.tsx を削除

learned:

- chronotype 削除後も将来「実績から観測した集中時間帯」を作る場合は git 履歴から gradient 描画基盤を戻せる
- fulfillment_score の DB カラムは TS 側が読まない状態で RPC に残る暫定形態（コード削除 → deploy → drop の中間状態として正当）
- calendar userSettings dispatcher を UserPreference ストアと CalendarSettings ストアの 2 ストアに縮約することで chronotype 依存を断ち切れた

files_of_note:

- apps/product/src/features/chronotype/ # 全削除（将来 gradient 基盤は git 履歴から復元可）
- apps/product/src/features/review/components/views/MonthlyReview.tsx # 削除
- apps/product/src/features/review/components/views/YearlyReview.tsx # 削除
- apps/product/src/features/entry/components/inspector/fields/FulfillmentRow.tsx # 削除
- apps/product/src/features/review/stores/useReviewFilterStore.ts # 'month'|'year' 除去
- apps/product/src/features/calendar/stores/userSettings.ts # chronotype ストア依存を除去し 2 ストア構成に縮約

next:

- [ ] entries.fulfillment_score / get_avg_fulfillment / avg_fulfillment RPC の DB カラム drop migration
- [ ] user_settings.chronotype_settings / get_stats_page_data の p_wake_hour / p_sleep_hour DB drop migration
- [ ] core-slim の次ターゲットを確認・着手
