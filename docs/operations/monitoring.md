---
status: current
last_verified: 2026-07-14
code:
  - apps/product/instrumentation.ts
  - apps/product/instrumentation-client.ts
  - apps/product/src/app/api/health/route.ts
---

# 監視・アラート

Dayoptのproduction監視はSentry、Vercel、Supabase、`/api/health`を組み合わせる。障害発生後の対応は[runbook](./runbook.md)、error capture実装規約は[error-handling skill](../../.agents/skills/error-handling/SKILL.md)を参照する。

## Monitoring surfaces

| Surface         | 見るもの                                                                   | 正本                                       |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| Sentry          | unhandled error、明示capture、CSP violation、performance trace、Web Vitals | Sentry dashboard + `apps/product/*sentry*` |
| Vercel          | deployment、function error / duration、traffic、build failure              | Vercel dashboard                           |
| Supabase        | database health、connection、API error、storage、Auth                      | Supabase dashboard                         |
| Health endpoint | app、database、必要な環境設定の疎通                                        | `GET /api/health`                          |
| GitHub Actions  | type / lint / test / build / docs guard                                    | `.github/workflows/`                       |

provider plan、sampling rate、SDK versionなどの値は変わるため、package manifest・runtime config・dashboardを正とする。

## Sentry runtime contract

- server / edge初期化: `apps/product/instrumentation.ts`と`sentry.{server,edge}.config.ts`
- browser初期化: `apps/product/instrumentation-client.ts`
- build integration: `apps/product/next.config.mjs`
- helperとPII scrub: `apps/product/src/lib/sentry/`
- production client captureはanalytics consentとenvironment gateに従う
- user contextはIDだけを使い、email、note、URL query等は`beforeSend`でscrubする

主なcapture経路:

- React / App Router error boundary
- tRPCのunexpected internal error
- `/api/csp-report`の有効なCSP violation
- Stripe webhook等のroute handlerで捕捉したunexpected error
- loggerのerror / warn breadcrumb

新しい`try/catch`やSentry captureを追加する場合は`.agents/skills/error-handling/SKILL.md`を先に読む。

## Alert policy

### Immediate

- productionのunhandled errorが新規発生または急増
- `/api/health`が503を返す
- login、Calendar data load、Plan / Record write、Stripe webhook等のcritical pathが継続失敗
- production deployment失敗

### Scheduled review

- error volume / regression: 週次
- Vercel function duration、bandwidth、build trend: 週次
- Supabase database size、connection、slow query: 週次
- provider usage / plan limit: 月次

通知channelはprovider dashboardとemailを基本とする。SentryからSlackへの転送は現行の必須運用ではない。`SLACK_BILLING_WEBHOOK_URL`はStripe課金イベント専用のoptional通知で、監視基盤やsecret schemaの必須項目にはしない。

## Incident triage

1. alertのenvironment、release、first seen、affected user数を確認する
2. Vercel deployment / function logとSentry traceを同じ時刻で照合する
3. DB/Authが関係する場合だけSupabase dashboardを確認する
4. user impactがある場合は`docs/operations/log/YYYY-MM-DD-incident-<slug>.md`を新規作成する
5. 復旧手順の変更はlogではなくrunbookへ反映する

secret、request body、user contentをissue・docs・chatへ貼らない。

## Verification

```bash
pnpm --filter @dayopt/product test:run -- src/lib/sentry/scrub-pii.test.ts
pnpm typecheck
pnpm lint
```

production dashboardへのtest event送信やalert設定変更は、目的と対象environmentを確認してから行う。
