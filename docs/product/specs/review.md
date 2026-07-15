---
status: current
last_verified: 2026-07-15
code: apps/product/src/features/review
---

# Review（振り返り）

Calendarの右panelでPlanとRecordの差分を読み、次の計画に使うための振り返り機能。点数・streak・評価ラベルは使わず、数字と事実を静かに示す。

## 現在の振る舞い

- 独立したReview pageは持たず、Calendarのcontextual panelとして表示する
- `panel=review`は週次Reflection、`panel=diff`はCalendarの表示範囲に対応する差分を表示する
- day / week / 2〜9day multi-dayのviewを維持したままpanelを開閉できる
- Reflectionは既存の集計結果をrule-basedな純粋関数で要約する。LLMやin-app AIは使わない
- DiffはCalendarが取得したPlan / Recordとその関連コンテキストから導出し、Review専用RPCは呼ばない
- 差分は未記録、やらなかった、予定に対する記録、予定外の記録を基礎に表示する
- 予定に対する記録はPlan単位でまとめ、複数の関連Recordがある場合は記録時間を合計してPlanとの差分を計算する
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
