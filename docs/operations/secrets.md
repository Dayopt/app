---
status: current
last_verified: 2026-07-21
code: scripts/env/schema.ts
---

# Secrets Management

このページを Dayopt の Secrets 運用の正本とする。1Password が長寿命 secret の master で、ローカルファイル・Vercel Env・GitHub Secrets・Supabase Dashboard secrets は replica として扱う。

---

## 基本方針

1. **1Password is master** — secret / token / recovery 情報 / 接続情報は 1Password を正とする
2. **local does not store real secret values** — ローカルに置くのは `.op-env.local` の `op://` 参照だけ
3. **external environments are replicas** — Vercel / GitHub Actions / Supabase Dashboard は 1Password から同期される複製
4. **値を表示しない** — 確認は存在確認だけにし、secret 本体を terminal / docs / issue / chat に出さない
5. **Turnstile is canonical** — bot protection は Cloudflare Turnstile を正とし、reCAPTCHA は旧方式として扱う
6. **contact credentials are separated** — app配送、app別webhook署名、Gmail返信SMTPの権限を共用しない

PR ごとの Supabase Preview Branch credentials は例外。Supabase / Vercel integration が作る ephemeral replica であり、1Password には保存しない。

`.env.local` に実値を置く運用は廃止。Vercel CLI などで一時生成された `.env.local` は unsafe / temporary として扱い、作業後に削除する。

---

## 保管対象

「API キー」「SSH 鍵」で分類すると漏れる。**漏れた時に何が起きるか** で分類する。

### ① API キー / アクセストークン

プログラム的アクセス権の鍵。Supabase service role、Stripe secret、Sentry auth token、Vercel token、GitHub PATなど。任意・legacyのprovider tokenも同じ分類で扱うが、runtime要件かどうかは`scripts/env/schema.ts`で判定する。

### ② SSH 鍵 / 署名鍵

- **SSH 秘密鍵**: GitHub push 権限そのもの
- **commit 署名鍵**: 検証済みコミットの信頼境界

SSH 秘密鍵は 1Password SSH Agent 管理を正とし、ローカル秘密鍵ファイルを増やさない。

### ③ DB 接続情報 / 接続文字列

Supabase DB password / pooler URL / 将来の Redis 等。接続文字列は user・password・host が一体化しやすいため、可能な限り field を分けて保管する。

### ④ OAuth / サービスアカウント

Google OAuth client secret、Apple Developer `.p8`、証明書、service account JSON など。ファイル形式のものは 1Password Document として保管する。

### ⑤ リカバリー系

再発行できないもの。各サービスの 2FA recovery codes、TOTP seed、ドメインレジストラ recovery 情報を含む。正本は各 Login item 側に置き、横断確認用に `Dayopt-Shared/recovery-codes` を使う。

---

## Vault / Item / Field Schema

field 名は可能な限り current code の env 名と一致させる。`.op-env.local.example` はこの schema の参照だけを持つ。

以下は期待schemaであり、2026-07-16時点では1Password CLIが未認証のため、各item / fieldの実在とempty状態を再確認できていない。Vercel Production replicaは確認済みだが、1Password masterの是正はblocked中の[#1558](https://github.com/Dayopt/dayopt/issues/1558)を所有者とし、確認前に重複変更しない。

### `Dayopt-Staging`

通常の PR Preview では使わない。persistent staging を追加した時、または local dev 用の長寿命参照が必要な時だけ使う。

| Item          | Fields                                                                                                                                                                             | 用途                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `supabase`    | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET` | Supabase local / preview 相当の接続   |
| `upstash`     | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                                               | Redis rate limit / cache              |
| `stripe-test` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`                                                                                                    | Stripe test mode                      |
| `resend`      | `RESEND_WEBHOOK_SECRET`                                                                                                                                                            | optional stagingのProduct webhook署名 |
| `app`         | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `RECOVERY_CODE_PEPPER`                                                                                                              | App URL / recovery code HMAC pepper   |

### `Dayopt-Production`

本番 secret は通常ローカルから参照せず、Vercel / Supabase Dashboard へ replica として同期する。Sentry は Product / Web で project を分離するため、metadata / DSN の item も分ける。

| Item          | Fields                                                                                                                                                                             |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase`    | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET` |
| `upstash`     | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                                               |
| `stripe-live` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`                                                                                                    |
| `resend`      | `RESEND_WEBHOOK_SECRET`（Product）                                                                                                                                                 |
| `resend-web`  | `RESEND_WEBHOOK_SECRET`（Web、Productと別値）                                                                                                                                      |
| `sentry`      | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`（Product）                                                                                                  |
| `sentry-web`  | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`（Web）                                                                                                      |
| `app`         | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `RECOVERY_CODE_PEPPER`                                                                                                              |

### `Dayopt-Shared`

| Item                     | Fields                                                                                        | 用途                                                |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `turnstile`              | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                      | Cloudflare Turnstile                                |
| `anthropic`              | `ANTHROPIC_API_KEY`                                                                           | optional / legacy key。現行runtime consumerなし     |
| `resend`                 | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                         | Product / WebのProduction email sending master      |
| `resend-support-replies` | `RESEND_SMTP_API_KEY`                                                                         | Gmail Send mail as専用。Sending access / domain限定 |
| `sentry`                 | `SENTRY_AUTH_TOKEN`                                                                           | Product / Web の Production release upload          |
| `github-login`           | password, TOTP, recovery codes                                                                | GitHub account login                                |
| `github-ssh`             | SSH private key                                                                               | GitHub SSH Agent                                    |
| `vercel`                 | `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PRODUCTION` | Vercel CLI / future automation                      |
| `google`                 | `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION`, `YAHOO_VERIFICATION`                       | Webmaster verification                              |
| `domain`                 | registrar login, TOTP, recovery codes                                                         | dayopt.app 管理                                     |
| `recovery-codes`         | service-specific recovery code index                                                          | 横断確認用。正本は各 Login item 側                  |

---

## Local Dev

ローカル開発の正規ルートは `.op-env.local` + `op run`。

```bash
cp .op-env.local.example .op-env.local
pnpm dev
```

`pnpm dev` は `.op-env.local` の存在を確認し、`.env.local` / `apps/product/.env.local` / `apps/web/.env.local` が残っている場合は fail する。通常は Supabase local を参照し、停止中なら自動起動してから `supabase status -o env` の結果を URL / key として値表示なしで注入する。

`.op-env.local` の Supabase refs をそのまま使う一時作業だけ `DAYOPT_SUPABASE_TARGET=op pnpm dev` を使う。素の起動が必要な一時作業だけ `pnpm dev:raw` を使う。

Sentry runtime と source map upload は Production 限定のため、local の `.op-env.local`、GitHub Actions、Vercel Preview / Development に Sentry env を複製しない。Vercel の `product` と `web` は同じ標準 env 名を使い、それぞれ `Dayopt-Production/sentry` と `Dayopt-Production/sentry-web` の値を Production target だけへ同期する。`SENTRY_AUTH_TOKEN` は `Dayopt-Shared/sentry` の単一 fieldをmasterとし、両projectのProduction targetへSensitive replicaとして同期する。

`.op-env.local` には `op://` 参照だけを書く。実値、dummy secret、placeholder secret は書かない。

---

## Verification

検証コマンドは `scripts/env/schema.ts` の schema を参照する。いずれも secret 値、prefix、suffix、長さ、hash は表示しない。

```bash
pnpm env:check
pnpm secrets:check
pnpm 1password:check
```

- `env:check` — required env を `OK / EMPTY / MISSING` だけで確認する
- `secrets:check` — tracked files と untracked `.env*` を scan し、literal secret は `value: [redacted]` で報告する
- `1password:check` — 1Password の vault / item / field / empty 状態だけを確認する。schemaで`required: true`のentryまたはoperational itemが不足・空の場合だけ失敗し、optional entryは不足・空の状態を表示しても成功する。item の作成・変更・削除はしない

`.op-env.local.example` の `op://` 参照は正規の local injection schema なので leak として扱わない。

---

## External Replicas

### Vercel Env

Vercel Production Env は runtime / build 用の replica。1Password を先に更新し、必要な値だけ Vercel Dashboard に手動同期する。Vercel 側で値を直接変更した場合は、必ず同じ変更を 1Password master に戻す。

Vercel Preview の Supabase env vars は Supabase Vercel integration が PR Preview Branch credentials を注入する。Preview scope に production Supabase credentials を手動設定しない。

Contact送信用の`RESEND_API_KEY` / `RESEND_FROM_EMAIL`とapp別`RESEND_WEBHOOK_SECRET`はProduct / WebのProductionだけへ同期する。送信credentialはPreview / Developmentへ置かない。Vercel metadataは`scripts/production-config-audit.mjs`でkey / target / typeだけを確認する。

旧`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO`のVercel replicaと専用PATは、Resendの両Production smokeと30分観察が終わるまで保持する。current schemaの新規作成対象からは外し、観察後に[問い合わせメール運用](./contact-email.md)の順で削除・失効する。

### GitHub Secrets

GitHub Actions Secrets は CI/CD 用の replica。build / e2e 用 public env などは 1Password から手動同期する。Migration は Supabase GitHub integration が担当するため、GitHub Actions から `supabase db push` しない。

### Supabase Dashboard Secrets

Supabase Auth Bot Protection、Auth hooks、Edge Functions、Vault secrets は Supabase Dashboard 側の replica。Turnstile secret などは 1Password から値をコピーし、Dashboard 側だけで変更しない。PR Preview Branch credentials は Supabase が短命に発行するため 1Password 管理外。

---

## Change Procedure

1. 1Password master の該当 item / field を更新する
2. 必要な長寿命 replica（Vercel Production Env / GitHub Secrets / Supabase Dashboard）へ同期する
3. `op read` や `op run` で **値を表示せず** 存在確認する
4. 旧 key がある場合は発行元サービスで revoke する
5. 変更内容は docs / PR には field 名と同期先だけを書く

`scripts/setup-1password.sh`は3 vaultが空の時だけ使う初回bootstrap専用。既存vaultへ新しいitem / fieldを追加する時はGUIまたは対象を限定した`op item create` / `op item edit`でmasterを先に更新し、`pnpm 1password:check`で値を表示せず検証してからreplicaへ同期する。

存在確認の例:

```bash
op read "op://Dayopt-Staging/supabase/SUPABASE_SERVICE_ROLE_KEY" >/dev/null && echo OK
```

---

## Unsafe / Temporary Commands

`vercel env pull` は通常の local dev flow ではない。使う場合は一時的な調査・復旧目的に限定する。

```bash
pnpm vercel:env:pull:unsafe
```

生成された `.env.local` は実値を含む可能性があるため unsafe / temporary として扱い、作業後に削除する。内容を terminal、chat、issue、docs に貼らない。

---

## Contact Delivery / Bot Protection

Cloudflare Turnstile が canonical provider。`NEXT_PUBLIC_TURNSTILE_SITE_KEY` は app / web の browser 側で使い、`TURNSTILE_SECRET_KEY` は web contact form と Supabase Dashboard replica で使う。

Product / Webの問い合わせはProductionだけResendへ送る。From / To / 件名はserver固定、送信者emailはReply-Toだけに使い、app別webhook署名secretを共用しない。Gmailの返信には`resend-support-replies`の専用SMTP keyだけを使う。

reCAPTCHA 関連 env は旧方式。新規設定・docs・example には追加しない。

---

## やっていいこと / やらないこと

### やっていいこと

- `op://` 参照を `.op-env.local` に書く
- 1Password item / field 名を docs に書く
- secret の存在確認だけを出力する
- Vercel Production / GitHub / Supabase Dashboard の長寿命 replica を同期する

### やらないこと

- 実値を `.env.local` / `.op-env.local.example` / docs に書く
- secret を terminal output、Slack、Issue、PR description に貼る
- `NEXT_PUBLIC_` だから安全、という判断で実値を公開する
- Production secret を通常の local dev から参照する
- PR Preview Branch credentials を 1Password に保存する
- `vercel env pull` を通常フローとして案内する

---

## 関連

- `.op-env.local.example` — local injection 参照例
- `apps/web/src/lib/turnstile/` — Turnstile 実装
- `docs/engineering/infra.md` — Supabase / deployment 環境構成
- `docs/operations/security/environment-secrets.md` — GitHub / Vercel / Supabase replica
- `docs/operations/contact-email.md` — 問い合わせのDNS / mailbox / release運用
