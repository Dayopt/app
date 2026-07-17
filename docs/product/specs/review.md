---
status: current
last_verified: 2026-07-17
code: apps/product/src/features/review
---

# Review（振り返り）

Calendarの右panelでPlanとRecordの差分を読み、次の計画に使うための振り返り機能。点数・streak・評価ラベルは使わず、数字と事実を静かに示す。

## 現在の振る舞い

- 独立したReview pageは持たず、Calendarのcontextual panelとして表示する
- `panel=review`と`panel=diff`は、どちらもCalendarの表示範囲に対応する内容を表示する
- day / week / 2〜7day multi-dayのviewを維持したままpanelを開閉できる
- 週末非表示時は、Calendarに実際に表示されている日だけをReview / Time P/Lの集計対象にする。先頭日と末尾日の間にある非表示の土日は含めない
- Reflectionは表示日と、その直前の同じ表示日数を比較する。週末非表示時は比較期間も土日を飛ばす。既存の集計結果をrule-basedな純粋関数で要約し、LLMやin-app AIは使わない
- DiffはCalendarが取得したPlan / Recordとその関連コンテキストから導出し、Review専用RPCは呼ばない
- 差分は未記録、やらなかった、予定に対する記録、予定外の記録を基礎に表示する
- 予定に対する記録はPlan単位でまとめ、複数の関連Recordがある場合は記録時間を合計してPlanとの差分を計算する
- Planとの差分が`±0`の項目は一覧に表示しない。期間全体の差分が0の場合はsummaryの`0分`を中立表示する
- 差分の正負は符号と方向iconで示し、成功・失敗を意味する色や評価ラベルは使わない
- PlanとRecordが別日の場合、PlanはPlan自身の日、RecordはRecord自身の日へ計上する。Planの日は未記録、Recordの日は関係を保った記録として表示する
- Review UIとStorybookはReview featureが所有し、Calendar shellがpanel slotへ合成する

## URL契約

- Review: `?panel=review`
- tag detail: `?panel=review&reviewTagId=<tag-id>`
- Diff: `?panel=diff`
- 期間の正本はCalendar routeのviewと`date`であり、panel固有の別期間を持たない

componentのvisual stateはStorybook、集計data flowとcompositionは[Engineering Architecture](../../engineering/architecture.md)を参照する。

## 関連する意思決定

- [機能スコープ](../log/2026-06-16-feature-non-adoption.md)
- [分析表現ポリシー](../log/2026-07-10-analytics-expression-policy.md)
- [ADR-025: Plan / Recordモデル](../log/2026-07-09-time-model-split.md)
