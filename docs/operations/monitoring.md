---
status: current
last_verified: 2026-08-14
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

| Surface         | 見るもの                                                                                | 正本                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry          | unexpected error、正規化済みCSP violation、performance trace                            | Sentry dashboard + Product / Web の runtime config                                                                                    |
| Vercel          | deployment、function error / duration、traffic、build failure                           | Vercel dashboard                                                                                                                      |
| Supabase        | database health、connection、API error、storage、Auth                                   | Supabase dashboard                                                                                                                    |
| Health endpoint | app、database、必要な環境設定の疎通                                                     | `GET /api/health`                                                                                                                     |
| UptimeRobot     | 外形監視（`/api/health` のHTTP status、5分間隔）、uptime、incident、response time       | UptimeRobot dashboard + メール通知。AI調査経路は[mcp-usage](../../.claude/rules/mcp-usage.md)のUptimeRobot節（read-onlyオンデマンド） |
| GitHub Actions  | type / lint / test / build / docs guard                                                 | `.github/workflows/`                                                                                                                  |
| Axiom           | Vercel Log Drains 経由の runtime / build / static log（契約表に載らない経路も含む全量） | Axiom dashboard（`vercel` dataset）。導入手順は下記 §Log Drains（Axiom）                                                              |

provider plan、sampling rate、SDK versionなどの値は変わるため、package manifest・runtime config・dashboardを正とする。

## Sentry runtime contract

- Product と Web は別 Sentry project とし、quota、alert、release、DSN を分離する
- server / edge は Production だけで常時初期化する。browser SDK、Analytics、Speed Insights は analytics consent 後だけ初期化する
- **認証未完了フロー（`/auth/*`）は client telemetry の対象外**。同意バナーは LCP 最適化のため `/auth/*` では表示されず（認証後に表示）、その配下では分析同意を得る機会が一度も無い。つまり signup / login 失敗など認証未完了中に起きたエラーは browser Sentry に届かない（#2029）。この窓の一次証跡は Supabase Auth logs（dashboard）を見る。privacy 境界（analytics 同意後だけ browser telemetry を有効化する）を崩してまでこの窓を埋めることはしない — 2026-07-16 の frozen 決定（`docs/operations/log/2026-07-16-sentry-runtime-consent-boundary.md`）を優先する
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

## Log Drains（Axiom）

策定日: 2026-08-14（#1701 Phase 3 の残作業）。

**目的**: 個別 route の契約表（本ファイル §Monitoring surfaces、`infra.md` §API Endpoints）に載らない経路（Server Action、ISR 再生成、Middleware、ビルドログ）を含む runtime / build ログの全量を、Vercel dashboard の保持期間を超えて横断検索できるようにする。ベンダーは Axiom に確定済み（保存リージョンの固定要件なし、CHECKPOINT で User 承認。決定の経緯は #1701 のコメント参照）。

**権限境界**: 本節は手順書であり、**Drain 作成の実操作は User が行う（`EXPLICIT AUTHORITY`）**。repo 側のコード変更は無い（Vercel Marketplace 経由の team-level 設定のみ）。

### 前提: コストと課金体系

- Vercel の Log Drains は **Pro / Enterprise plan 限定**（Dayopt は Pro plan で対象）
- 課金は **転送量 $0.50/GB、無料枠なし**。計測は圧縮前の JSON serialize サイズで、Axiom 側の "bytes received" 表示より大きく出るのが仕様（Vercel 公式ドキュメント）
- Axiom 公式ドキュメントは、高 volume な場合は Drains 経由の Marketplace 連携より `next-axiom` ライブラリ（アプリ内 SDK 直接送信）の方が安いと明記している。Dayopt は Drains（Marketplace 連携）を選んだ — 契約表に載らない経路まで無条件に拾える運用の単純さを優先した判断で、`next-axiom` への切替は volume が実際に膨らんでから再検討する（出口コスト: Drain を切って `next-axiom` の instrumentation を各 app に追加するだけなので `[hours]`）

### 手順

1. **Spend Management の上限設定（先に行う）** — 上記のコスト無しに Drain だけ有効化すると、無料枠なしの従量課金が上限なく積み上がる。Vercel team dashboard → **Settings → Billing → Spend Management** を有効化し、USD 上限額を設定する。Owner または Billing role が必要
   - 上限到達時のアクション（通知 / webhook / 全 project の production 一時停止）を選べる。**「production を自動一時停止」は本番影響が大きいため、既定では有効化せず通知のみに留める**（判断が必要なら CHECKPOINT で User に確認する）
   - 通知しきい値は 50% / 75% / 100% で自動設定される。**Settings → My Notifications** で Web / Email（必要なら SMS）を有効にしておく
2. **Axiom Marketplace integration の接続** — [Vercel Integrations: Axiom](https://vercel.com/integrations/axiom) から Install し、Dayopt team とリンクする。接続対象 project は `product` / `web` を選択する
   - この操作で Axiom 側に Log Drain が自動作成され、ログは Axiom の `vercel` dataset へ即座に流れ始める（Axiom 側での事前の dataset 作成や API token 発行は不要 — integration が自己完結する）
3. **検証** —
   - Vercel team dashboard → **Settings → Drains** で、作成された Drain の status が `enabled` であることを確認する
   - Axiom dashboard → `vercel` dataset で、直近デプロイのログが実際に届いていることを確認する（`vercelProjectName` フィールドで product / web を区別できる）
   - Spend Management の **Activity** セクション（team dashboard サイドバー）で、上限設定が反映されていることを確認する
4. **rollback**（`[hours]`） — Vercel team dashboard → Settings → Drains から該当 Drain を disable、または Integrations 画面から Axiom を uninstall する。課金は停止時点までの転送量分のみ

### 運用上の注意

- Drain は team scope の設定であり、コードや env に新しい secret は増えない（`docs/operations/secrets.md` の対象外）
- ログ内容自体の PII 境界は既存の `@/lib/logger` 構造化ログの sanitize 方針（本ファイル §Sentry runtime contract の secret 非送出方針と同型）に従う。Axiom 側で追加の redaction は行わない前提のため、**構造化ログに secret / PII を書かない規律がそのまま Axiom 上のログにも適用される**ことを意識する

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
- **browser client telemetry の生死確認: 月次**（#2029）。Sentry で `environment:production has:browser.name` を直近30日で検索し、件数が0でないことを確認する。0件なら consent gate・DSN・CSP・SDK 初期化のどこかが壊れている可能性が高く、`docs/operations/log/2026-07-16-sentry-runtime-consent-boundary.md` の contract に沿って client 側の初期化パス（`instrumentation-client.ts` / `packages/observability/src/consent.ts`）を調査する。新しい常設 canary surface は作らない（2026-07-16〜23 に一時追加した operator smoke surface は複雑さに見合わず撤去済み）

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
