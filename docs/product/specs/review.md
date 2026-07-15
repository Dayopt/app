---
status: current
last_verified: 2026-07-15
code: apps/product/src/features/review
---

# Review（振り返り）

Calendarの右panelでPlanとRecordの差分を読み、次の計画に使うための振り返り機能。点数・streak・評価ラベルは使わず、数字と事実を静かに示す。

## 現在の振る舞い

- 独立したReview pageは持たず、Calendarのcontextual panelとして表示する
- `panel=review`と`panel=diff`は、どちらもCalendarの表示範囲に対応する内容を表示する
- day / week / 2〜9day multi-dayのviewを維持したままpanelを開閉できる
- 週末非表示時も、Calendarに表示される先頭日から末尾日までをpanelの期間として使う
- Reflectionは表示範囲と、その直前の同日数を比較する。既存の集計結果をrule-basedな純粋関数で要約し、LLMやin-app AIは使わない
- DiffはCalendarが表示中のPlan / Recordから導出し、追加RPCを呼ばない
- 差分は未記録、やらなかった、予定に対する記録、予定外の記録を基礎に表示する
- Diff panel（`panel=diff`）の増減は符号と方向で示し、success / destructive色による善悪判定は行わない
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
