---
status: current
last_verified: 2026-07-02
code: apps/product/src/features/auth
---

# Auth（認証）

Supabase Auth ベースの認証機能。

## 現在の振る舞い

- Supabase Auth によるセッション管理（メール/パスワード、MFA検証フローを含む）
- `protectedProcedure` で保護された tRPC procedure が `ctx.userId` でデータアクセスを制限する
- RLS（Row Level Security）によるDBレベルでの認可を併用する

## 関連する意思決定

- [Security運用](../../operations/security/environment-secrets.md)
