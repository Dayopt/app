---
status: current
last_verified: 2026-07-22
---

# Environment Secrets

Dayopt の Secrets 運用の正本は [Operations / Secrets](../secrets.md)。
このページでは GitHub / Vercel / Supabase 側に置かれる replica の役割だけを整理する。

## 基本方針

- 1Password は production / shared / optional staging の長寿命 secrets の master
- Vercel Env、GitHub Secrets、Supabase Dashboard secrets は replica
- PR Preview 用 Supabase credentials は Supabase / Vercel integration が作る ephemeral replica
- PR Preview credentials は 1Password に保存しない
- 値の確認は存在確認だけにし、terminal / docs / issue / chat に出さない

## GitHub

GitHub Actions は lint / typecheck / test / build などの検証を担当する。
Supabase migration の production 適用は GitHub Actions ではなく Supabase GitHub integration が担当する。

GitHub branch protection では、通常の CI check に加えて Supabase integration の Preview Branch check を required にする。

| Secret                             | 用途                                         | 方針                                                                                          |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `CODECOV_TOKEN`                    | coverage upload                              | CI 用 replica                                                                                 |
| `LHCI_GITHUB_APP_TOKEN`            | Lighthouse CI                                | CI 用 replica                                                                                 |
| `SUPABASE_ACCESS_TOKEN`            | emergency / manual operation                 | 通常 migration flow では使わない                                                              |
| `VERCEL_TOKEN`                     | Production Config Audit / Production Release | env metadata読取、Production promote / rollback、promoteの副作用で戻るproject設定の復元に限定 |
| `VERCEL_ORG_ID`                    | Production Config Audit / Production Release | 1Password `VERCEL_TEAM_ID`のGitHub replica                                                    |
| `VERCEL_AUTOMATION_BYPASS_PRODUCT` | Production Release smoke                     | Product の Protection Bypass for Automation                                                   |
| `VERCEL_AUTOMATION_BYPASS_WEB`     | Production Release smoke                     | Web の Protection Bypass for Automation                                                       |

GitHub Actions の通常 build は release / source map upload を行わないため、Sentry metadata と `SENTRY_AUTH_TOKEN` を渡さない。

`VERCEL_TOKEN`をlocal CLIの`--token`引数へ渡さない。Vercel CLIはpaginationなどの再実行案内に引数値を含める場合がある。localのmetadata確認はconnector、Dashboard、または対話login済みCLIを使う。Production Config AuditとProduction Releaseは1Password masterから同期したGitHub replicaを環境変数で受け取り、process内でAuthorization headerにだけ設定する。Protection Bypass secretも同様に、smoke requestのheaderにだけ設定してlogやerror messageへ出さない。

露出が疑われる場合は値を表示・比較せず、replacement作成 → 1Password master更新 → GitHub replica更新 → trusted branchでProduction Config Audit成功確認 → 旧token revokeの順でrotateする。旧tokenを先にrevokeするとauditとProduction Releaseの両方が止まるため、この順序を崩さない。事故記録は[Vercel CLI token出力 incident](../log/2026-07-22-incident-vercel-cli-token-output.md)を参照する。

## Vercel

| Environment | Supabase credentials                                        |
| ----------- | ----------------------------------------------------------- |
| Production  | `Dayopt-Production/supabase` から手動同期した replica       |
| Preview     | Supabase Vercel integration が PR branch credentials を注入 |
| Development | 通常は使わない。local は `.op-env.local` + `op run`         |

Preview scope に production Supabase credentials を手動設定しない。
既に入っている場合は削除するか、Preview から外して Supabase integration 管理に寄せる。

### Sentry

`product` と `web` は別 Sentry project を使う。両Vercel projectでenv名は共通だが、`NEXT_PUBLIC_SENTRY_DSN`、`SENTRY_DSN`、`SENTRY_PROJECT`は各project固有の値とする。`SENTRY_ORG`とbuild tokenは共通でよい。

| Vercel target | Sentry env                                                                      |
| ------------- | ------------------------------------------------------------------------------- |
| Production    | 5変数すべて。`SENTRY_AUTH_TOKEN`はSensitive、残りは公開metadata / DSNとして扱う |
| Preview       | 設定しない。runtime、release作成、source map uploadを行わない                   |
| Development   | 設定しない。localもSentryへ送信しない                                           |

Production replicaはProductが`Dayopt-Production/sentry`、Webが`Dayopt-Production/sentry-web`をmetadata / DSNのmasterとする。build tokenだけは`Dayopt-Shared/sentry`の単一fieldを両projectへ同期する。

2026-07-16 のVercel確認では、Product / Webとも5変数をProductionだけに設定し、Preview / DevelopmentにはSentry envがないことを確認した。1Password CLIは未認証だったため、上記item / fieldが実在し空でないことは未確認である。master側の確認と不足fieldの整理はblocked中の[#1558](https://github.com/Dayopt/dayopt/issues/1558)で行い、確認前に推測でitemを変更しない。

### Vercel readiness audit (2026-07-14)

対象 project は Vercel team `Dayopt` の `product` と `web`。
確認は secret 値ではなく metadata と未認証レスポンスだけを見る。

#### Preview protection

| URL                                | 期待                                               | 2026-07-08 確認結果                   |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------- |
| `*.vercel.app` preview (`product`) | 未認証は Vercel SSO / Deployment Protection に送る | `302` to `https://vercel.com/sso-api` |
| `*.vercel.app` preview (`web`)     | 未認証は Vercel SSO / Deployment Protection に送る | `302` to `https://vercel.com/sso-api` |
| `app.dayopt.app`                   | production app として通常到達できる                | `200`                                 |
| `dayopt.app`                       | production marketing site として通常到達できる     | `200`                                 |
| `mcp.dayopt.app`                   | OAuth / token validation で保護される              | `401`                                 |

`product` には Automation Bypass が存在し、Vercel env var として管理されている。
値は docs / issue / PR / terminal に出さない。漏えいが疑われる場合は Vercel Dashboard で rotate し、
新しい値は 1Password か Vercel-managed secret storage だけに置く。

#### Env scope / Sensitive flag

`product` Preview に production Supabase credentials は見えない。
Supabase integration 由来の production DB / key も `production` target のみ。

2026-07-21にVercel APIで値を復号せずkey / target / typeだけを再確認した。Contact移行前の状態は次のとおりで、まだProduction契約を満たさない。

| Project   | Metadata                                 | 確認結果                                                | Merge前の対応                               |
| --------- | ---------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `product` | `RESEND_API_KEY`                         | Production / PreviewはSensitive、DevelopmentはEncrypted | Productionだけへ限定する                    |
| `product` | `RESEND_FROM_EMAIL`                      | Production / Preview / Developmentに存在                | Productionだけへ限定する                    |
| `product` | `RESEND_WEBHOOK_SECRET`                  | Production Sensitive                                    | 維持する                                    |
| `web`     | Resend 3変数                             | いずれも存在しない                                      | Productionへ追加する                        |
| 両方      | Upstash 2変数                            | Productionに存在                                        | tokenをSensitiveのまま維持する              |
| `web`     | Turnstile 2変数                          | Productionに存在                                        | secretをSensitiveのまま維持する             |
| 両方      | 旧`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO` | Production / Preview / Developmentに残存                | smokeと30分観察後まで保持し、その後削除する |

Contactの目標契約:

- Product / WebのProductionに`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、app別`RESEND_WEBHOOK_SECRET`を置く
- `RESEND_API_KEY`と`RESEND_WEBHOOK_SECRET`はSensitive typeかつProduction targetだけにする
- Product / Webのwebhook secretが異なることはmetadataでは証明できないため、Resend / Vercel dashboardで値を表示せず確認する
- `RESEND_API_KEY`と`RESEND_WEBHOOK_SECRET`がPreview / Developmentにあれば`Production Config Audit`を失敗させる
- 旧GitHub envの不在検査はProduction smoke後に`AUDIT_FORBID_LEGACY_CONTACT_ENV=true`で有効にする

Previewは`RECOVERY_CODE_PEPPER`を維持する。production modeのenv validation / recovery code処理に必要なためである。その他のDevelopment secret cleanupは[#1558](https://github.com/Dayopt/dayopt/issues/1558)のscopeとし、Contact切替と混ぜない。

履歴は[Vercel environment variable scope audit](../log/2026-07-14-vercel-env-scope-audit.md)、Contact切替の手順は[問い合わせメール運用](../contact-email.md)を参照する。

`NEXT_PUBLIC_*` と repository 名などの公開 metadata は secret 扱いにしない。
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` は public key なので、`sensitive` のままでも事故ではないが必須ではない。

#### Pre-deploy dry run

2026-07-08 時点の local Vercel CLI は `50.32.5`。
`vercel deploy --help` に `--dry` は出ていないため、`vercel deploy --dry` を pre-deploy check / CI に入れない。
CLI と公式 docs の両方で dry run が確認できた時点で、次の順で再評価する。

1. `vercel deploy --help` で `--dry` が表示されることを確認する
2. `product` と `web` で deploy されないことを確認する
3. 出力が secret 値を含まないことを確認する
4. 有用なら `pnpm` script か CI の warning-only step に入れる

## Supabase

Supabase Dashboard secrets は Supabase 側で必要な長寿命 replica として扱う。
Auth Bot Protection、Auth hooks、Edge Functions、Vault secrets は 1Password master から手動同期する。

PR Preview Branch credentials は短命で、Supabase Branching / Vercel integration が扱う。
手動で 1Password や GitHub Secrets に保存しない。

## Emergency Only

手動 `supabase db push` や linked DB reset は通常導線ではない。
Supabase integration 障害などで緊急対応が必要な時だけ、理由と対象環境を作業ログに残して実行する。

```bash
pnpm db:reset-linked:unsafe
```
