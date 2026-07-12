---
status: current
last_verified: 2026-07-12
code: apps/product/src/features/review
---

# Review（振り返り）

Plan（予定）と Record（記録）の差分を見て気づきを得るための分析機能。「判定しない」設計（スコア・ストリーク・赤マークなし）。

## 現在の振る舞い

- 粒度適応型の構成（日次・週次）。月次・年次ビューは core-slim 方針で廃止済み
- `CalendarReviewPanel` として提供される（feature内部の public API 名は歴史的経緯で `stats` のまま残っているコメントがある。実際の機能名は Review）
- rule-based の所見生成（能動的な分析操作なし。Watching AI がパッシブにパターンを発見する）
- 差分は **未記録の予定 / やらなかった予定 / 予定に対する記録 / 予定外の記録** の4分類（1 Plan : N Record 前提）
- 判定ラベルではなく数字で差分を示す（`plan_id` ありの Record には差分を数字で添え、±0 は非表示。`plan_id` なしの Record は「予定外」の静かなマーカーのみ）

## 進行中の変更

`/review` 独立ページを廃止し、Calendar 内の contextual panel（Desktop: 右panel、Mobile: bottom sheet）へ統合中。本ファイルは移行完了後に更新する。

## 関連する意思決定

- [機能スコープ: やらないことを決める](../log/2026-06-16-feature-non-adoption.md)（Productivity score / streaks を採用しない理由）
