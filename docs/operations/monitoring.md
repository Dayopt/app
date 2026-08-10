---
status: current
last_verified: 2026-08-10
code:
  - packages/observability
  - apps/product/src/instrumentation.ts
  - apps/product/instrumentation-client.ts
  - apps/web/src/instrumentation.ts
  - apps/web/instrumentation-client.ts
  - apps/product/src/app/api/health/route.ts
---

# 監視・アラート

Dayoptのproduction監視はSentry、Vercel、Supabase、`/api/health`、UptimeRobotを組み合わせる。障害発生後の対応は[runbook](./runbook.md)、error capture実装規約は[error-handling skill](../../.claude/skills/error-handling/SKILL.md)を参照する。

## Monitoring surfaces

| Surface         | 見るもの                                                                          | 正本                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry          | unexpected error、正規化済みCSP violation、performance trace                      | Sentry dashboard + Product / Web の runtime config                                                                                    |
| Vercel          | deployment、function error / duration、traffic、build failure                     | Vercel dashboard                                                                                                                      |
| Supabase        | database health、connection、API error、storage、Auth                             | Supabase dashboard                                                                                                                    |
| Health endpoint | app、database、必要な環境設定の疎通                                               | `GET /api/health`                                                                                                                     |
| UptimeRobot     | 外形監視（`/api/health` のHTTP status、5分間隔）、uptime、incident、response time | UptimeRobot dashboard + メール通知。AI調査経路は[mcp-usage](../../.claude/rules/mcp-usage.md)のUptimeRobot節（read-onlyオンデマンド） |
| GitHub Actions  | type / lint / test / build / docs guard                                           | `.github/workflows/`                                                                                                                  |

provider plan、sampling rate、SDK versionなどの値は変わるため、package manifest・runtime config・dashboardを正とする。

## Sentry runtime contract

- Product と Web は別 Sentry project とし、quota、alert、release、DSN を分離する
- server / edge は Production だけで常時初期化する。browser SDK、Analytics、Speed Insights は analytics consent 後だけ初期化する
- browser telemetryの同意撤回時はclientを即時無効化してページを再読込し、SDK integration、active span、breadcrumb scopeを残さない
- Session Replayは、現行SDKではRRWeb metadataとReplay envelopeのraw URL queryを通常sanitizerで除去できないため無効にする
- build integration と source map upload は Vercel Production build だけで実行する。CI / Preview / Development に `SENTRY_AUTH_TOKEN` を置かない
- 両 Vercel project は同じ env 名を使うが、DSN と project 値は project scope ごとに異なる。env の正本は [secrets](./secrets.md)
- sanitizer と同意判定は `packages/observability`、app 固有の初期化は各 app の instrumentation / Sentry config を正とする
- user context は内部 ID だけを使う。email、user content、request body、request header、cookie、authorization、URL query は送信しない
- `event_id`、`trace_id`、`span_id`、release、environment など Sentry protocol 値は変更しない

主なcapture経路:

- React / App Router error boundary
- tRPCのunexpected internal error
- `/api/csp-report`の有効なCSP violation
- Stripe webhook等のroute handlerで捕捉したunexpected error
- loggerのerror / warn breadcrumb

expected auth / validation / not-found / conflict、Web Vitals、正常な login / billing event は Issues に送らない。性能は trace と Speed Insights、正常系行動は既存 analytics で確認する。

新しい`try/catch`やSentry captureを追加する場合は`.claude/skills/error-handling/SKILL.md`を先に読む。

### Provider-side status (2026-07-23)

- Product project `dayopt` と Web project `dayopt-web` を分離済み。両projectでIP addressを保存せず、default scrub / server-side scrub / custom sensitive fieldsをorganization設定から継承する
- 両projectでSpike Protectionを有効化し、`ChunkLoadError`は一律filterしない。browser key loaderのSession Replayも無効化している
- Productの既存高優先度alertを維持し、Webに同等の高優先度alertを作成した。Webのtest notificationが実メールへ届くことまで確認済み
- organizationはowner 1名で、2FA必須化とjoin request停止を適用済み。open team membership、memberによる招待・project作成・event削除・monitor/alert編集はすべて無効化している
- Sentry build tokenはVercel作成のinternal integrationを使い、Issue/Event accessを付与しない。release/source map以外へ用途を広げない

運用リンク:

- [Product health dashboard](https://dayopt.sentry.io/dashboard/8390965/?environment=production&project=4509737836412928)
- [Web health dashboard](https://dayopt.sentry.io/dashboard/8390994/?environment=production&project=4511741979394048)
- [Organization Stats](https://dayopt.sentry.io/stats/) — accepted / discarded / filtered / quotaはcustom dashboard datasetで表現できないため、このbuilt-in画面を正とする

各health dashboardはunresolved Issue、release別error、transaction failure rate、transaction duration p50/p75/p95、Replay-linked error件数（期待値0）を表示する。provider設定の変更履歴とProduction smokeのevent-level証跡は[#1566](https://github.com/Dayopt/dayopt/issues/1566)に集約する。

Product / Webのbrowserを含むProduction検証、alert email、source map、trace、PII境界のevent-level証跡は[#1566](https://github.com/Dayopt/dayopt/issues/1566)を正とする。Product Edgeの元TypeScript行へのsymbolicationだけはVercel Edge再bundleのupstream制約があり、release・trace・PII不在を受入条件とする。

### Production検証用surfaceの撤去契約

2026-07-23の検証に使ったoperator専用surfaceは恒久APIや一般ユーザー向けUIにせず、active sourceから撤去した。将来再検証が必要な場合も既存surfaceを復元して常設せず、次の契約を満たす短命変更を別途reviewする。

- raw tokenをconsole、clipboard、DOM、URL、cookie、storage、docs、issueへ残さず、providerにはapp別digestだけを置く
- Production限定flag、固定deadline、env expiry、same-origin、空body、IP/global rate limitでfail closedにする
- 検証traceだけを一時的に100% sampleし、通常のProduct/Web browser・server 10%と両Edge 5% samplingは変えない
- 対象project、deployment URL、commit SHA、event、alert、削除手順を[#1566](https://github.com/Dayopt/dayopt/issues/1566)相当の運用issueへ記録する
- flag-off deployの後にcodeと一時envを削除し、canonical URLと記録済み旧deployment URLのGET / POST / OPTIONSが404であることを確認する

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

通知channelはprovider dashboardとemailを基本とする。

## Incident triage

1. alertのenvironment、release、first seen、affected user数を確認する
2. Vercel deployment / function logとSentry traceを同じ時刻で照合する
3. DB/Authが関係する場合だけSupabase dashboardを確認する
4. user impactがある場合は`docs/operations/log/YYYY-MM-DD-incident-<slug>.md`を新規作成する
5. 復旧手順の変更はlogではなくrunbookへ反映する

secret、request body、user contentをissue・docs・chatへ貼らない。

## Verification

```bash
pnpm --filter @dayopt/observability exec vitest run src/sanitize.test.ts
pnpm --filter @dayopt/product exec vitest --project unit run src/lib/sentry/__tests__/scrub-pii.test.ts
pnpm --filter @dayopt/web exec vitest run src/app/api/csp-report/route.test.ts src/platform/observability/instrumentation-client.test.ts
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm docs:check
```

production dashboardへのtest event送信やalert設定変更は、目的と対象environmentを確認して明示承認を得てから行う。repositoryには常設のtest surfaceを置かない。
