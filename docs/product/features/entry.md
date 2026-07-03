---
status: current
last_verified: 2026-07-02
code: apps/product/src/features/entry
---

# Entry（エントリ）

Dayoptの中心概念。「時間ブロック」として、計画（予定）と記録（実績）を単一モデルで持つ。

## 現在の振る舞い

- 1エントリは `start_time`/`end_time`（予定）と `actual_start`/`actual_end`（実績）を両方持てる
- `origin` が `planned`（事前計画）か `unplanned`（アドホック作成）かを区別する
- 時間位置から `upcoming` / `active` / `past` の3状態が自動導出される。DBカラムではなく算出値
- `past` になったエントリは予定側（`start_time`/`end_time`）を編集不可。実績記録（`actual_*`, `fulfillment_score`）のみ編集可能
- 1エントリにつきタグは1つ（`仕事:開発` のようなコロン区切り最大2階層）
- `fulfillment_score`（1-5）で振り返り時の主観的達成度を記録する
- entries 同士の時間重なりはDB制約（EXCLUDE制約）で全面禁止

## 関連する意思決定

- [ADR-011 統合ブロックモデル](../../engineering/log/2026-03-05-unified-block-model.md)
- [ADR-015 時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [ADR-018 時間重なりの全面禁止](../log/2026-05-13-time-overlap-prohibition.md)
- [ADR-019 自動記録モデル](../log/2026-06-10-auto-record-model.md)
- [ADR-020 entries の論理削除](../../engineering/log/2026-03-18-soft-delete-model.md)
- [機能スコープ: やらないことを決める](../log/2026-06-16-feature-non-adoption.md)（繰り返し予定を採用しない理由）
