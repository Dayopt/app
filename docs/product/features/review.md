---
status: current
last_verified: 2026-07-02
code: apps/product/src/features/review
---

# Review（振り返り）

計画と実績の差分を見て気づきを得るための分析機能。「判定しない」設計（スコア・ストリーク・赤マークなし）。

## 現在の振る舞い

- 粒度適応型の構成（日次・週次）。月次・年次ビューは core-slim 方針で廃止済み
- `CalendarReviewPanel` として提供される（feature内部の public API 名は歴史的経緯で `stats` のまま残っているコメントがある。実際の機能名は Review）
- rule-based の所見生成（能動的な分析操作なし。Watching AI がパッシブにパターンを発見する）

## 進行中の変更

`/review` 独立ページを廃止し、Calendar 内の contextual panel（Desktop: 右panel、Mobile: bottom sheet）へ統合中。本ファイルは移行完了後に更新する。

## 関連する意思決定

- [review-granularity-redesign 完了サマリー](../../log/archive/projects/review-granularity-redesign/summary.md)（done。核となる設計判断の記録）
- [機能スコープ: やらないことを決める](../../log/decisions/010-feature-non-adoption.md)（Productivity score / streaks を採用しない理由）
