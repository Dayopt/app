---
status: current
last_verified: 2026-07-16
---

# 契約サービス一覧

Dayopt が運用時に依存する外部サービスの索引。ここでは用途と確認先を管理し、料金・上限・契約プランの値は各サービスの管理画面または請求書を正とする。コード上の依存は `package.json`、環境変数は `scripts/env/schema.ts` と Vercel / 1Password の設定を確認する。

| サービス             | 用途                                    | リポジトリ内の確認先                                                                           | 契約情報の正本                            |
| -------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Vercel               | Web 配信、Functions、Analytics          | `vercel.json`、`.github/workflows/`                                                            | Vercel dashboard / invoice                |
| Supabase             | PostgreSQL、Auth、Storage、Realtime     | `supabase/`、`packages/supabase/`                                                              | Supabase organization dashboard / invoice |
| Sentry               | エラー・パフォーマンス監視              | Product / Web の別project、`packages/observability`、[monitoring](../operations/monitoring.md) | Sentry organization settings / invoice    |
| Upstash Redis        | rate limit の共有 backend               | `packages/rate-limit/`                                                                         | provider dashboard / invoice              |
| Stripe               | subscription、Checkout、Portal、Webhook | `apps/product/src/features/billing/`、[billing spec](../product/specs/billing.md)              | Stripe dashboard                          |
| Resend               | transactional email                     | `packages/email/`                                                                              | Resend dashboard / invoice                |
| GitHub               | repository、Issues / PR、Actions        | `.github/`                                                                                     | repository / organization settings        |
| Cloudflare Turnstile | 公開フォームの bot 対策                 | `apps/web/src/features/contact/`                                                               | Cloudflare dashboard                      |
| 1Password            | secret の master 管理とローカル注入     | `.op-env.local.example`、`scripts/env/`、[secrets](../operations/secrets.md)                   | 1Password admin console / invoice         |
| Slack                | 課金イベント通知の任意 webhook          | `apps/product/src/features/billing/server/notifications/`                                      | Slack workspace settings                  |
| ドメインレジストラ   | `dayopt.app` の登録・更新               | DNS / registrar console                                                                        | registrar invoice                         |

## 更新ルール

- 新しい runtime SaaS を導入したら、実装と同じ変更でこの表と関連する operations docs を更新する。
- 解約や移行は行を黙って消さず、該当ドメインの `log/` に判断を残してから現行表を更新する。
- 金額、workflow 数、プラン上限など変動する値をこのファイルへ複製しない。
- 開発時だけ使う Context7、Storybook MCP などは runtime 契約に含めない。
- Anthropic / OpenAI は runtime 依存ではない。AI 連携はユーザーが選ぶ MCP / API client 側で行う。

関連: [business model](../business/business-model.md) / [tooling](../operations/tooling.md) / [environment and secrets](../operations/secrets.md)
