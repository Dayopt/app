---
status: current
last_verified: 2026-07-14
code: apps/product/src/features/settings
---

# Settings（設定）

ユーザー設定全般。プロフィール、表示、データ管理、課金、アカウントをカテゴリ別ページで提供する。

## 現在の振る舞い

- `/settings/[category]` のカテゴリ別ルーティング（`profile` / `display` / `data` / `billing` / `account`）
- 通知は独立カテゴリとして提供していない。将来追加する場合も「計画に仕える」opt-in の合図に限定し、streak 煽り・re-engagement push は作らない（[strategy.md §4-7](../../business/strategy.md)）
- 課金設定は Stripe Customer Portal と連携する（[Billing](./billing.md) 参照）
- データエクスポート（CSV/JSON）は Pro 機能

## 関連する意思決定

- [Billing](./billing.md)
