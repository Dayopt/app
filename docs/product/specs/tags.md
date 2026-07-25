---
status: current
last_verified: 2026-07-24
code: apps/product/src/features/tags
public_docs:
  - tags
lp:
  - 'Tags'
  - 'Unlimited tags'
---

# Tags（タグ）

ブロック（Plan / Record）の活動分類。Dayoptにおけるタスク管理の代替（タスクリストは持たない）。

## 現在の振る舞い

- コロン(`:`)区切りで最大2階層の分類を表現する（例: `仕事:開発`, `学習:英語`）
- 各タグにカラー（10色パレット）とアイコンを設定できる
- 1ブロック1タグ（複数タグの付与はしない）。Plan と Record はそれぞれ独立して `tag_id` を持つ
- タグ削除時は影響を受ける Plan / Record の扱いを確認するダイアログを挟む

## 関連する意思決定

- [機能スコープ: やらないことを決める](../log/2026-06-16-feature-non-adoption.md)（ToDo管理・Kanban等を採用しない理由）
