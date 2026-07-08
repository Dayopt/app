---
status: current
last_verified: 2026-07-08
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

| Secret                  | 用途                               | 方針                             |
| ----------------------- | ---------------------------------- | -------------------------------- |
| `CODECOV_TOKEN`         | coverage upload                    | CI 用 replica                    |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI                      | CI 用 replica                    |
| `SENTRY_AUTH_TOKEN`     | release / sourcemap 操作が必要な時 | 1Password から同期               |
| `SUPABASE_ACCESS_TOKEN` | emergency / manual operation       | 通常 migration flow では使わない |

## Vercel

| Environment | Supabase credentials                                        |
| ----------- | ----------------------------------------------------------- |
| Production  | `Dayopt-Production/supabase` から手動同期した replica       |
| Preview     | Supabase Vercel integration が PR branch credentials を注入 |
| Development | 通常は使わない。local は `.op-env.local` + `op run`         |

Preview scope に production Supabase credentials を手動設定しない。
既に入っている場合は削除するか、Preview から外して Supabase integration 管理に寄せる。

### Vercel readiness audit (2026-07-08)

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

次の server-only secret は Vercel CLI API で `sensitive` に更新済み。
値は読まず、`vercel api` で env type だけを変更した。

| Project   | Env                         | Production / Preview | Development |
| --------- | --------------------------- | -------------------- | ----------- |
| `product` | `SUPABASE_SERVICE_ROLE_KEY` | `sensitive`          | n/a         |
| `product` | `RECOVERY_CODE_PEPPER`      | `sensitive`          | `encrypted` |
| `product` | `RESEND_API_KEY`            | `sensitive`          | `encrypted` |
| `product` | `RESEND_WEBHOOK_SECRET`     | `sensitive`          | n/a         |
| `product` | `SENTRY_AUTH_TOKEN`         | `sensitive`          | `encrypted` |
| `product` | `GITHUB_TOKEN`              | `sensitive`          | `encrypted` |
| `web`     | `GITHUB_TOKEN`              | `sensitive`          | `encrypted` |

Development scope の secret は Vercel Sensitive Env の対象外として `encrypted` のまま残す。
今後の棚卸しでは、development / preview に long-lived secret が必要かを用途ごとに確認する。

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
