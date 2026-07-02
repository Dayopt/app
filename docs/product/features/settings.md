---
status: current
last_verified: 2026-07-02
code: apps/product/src/features/settings
---

# Settings（設定）

ユーザー設定全般。プロフィール、表示、通知、課金、データ管理をカテゴリ別ページで提供する。

## 現在の振る舞い

- `/settings/[category]` のカテゴリ別ルーティング（プロフィール / 表示 / 通知 / 課金 / データ管理）
- 課金設定は Stripe Customer Portal と連携する（[Billing](../../business/billing.md) 参照）
- データエクスポート（CSV/JSON）は Pro 機能

## 関連する意思決定

- [Billing](../../business/billing.md)
