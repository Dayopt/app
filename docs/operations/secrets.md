---
status: current
last_verified: 2026-07-24
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

## AI エージェントの env ファイル境界

Claude はローカル環境で作業する唯一の coding agent であり、本節はその境界を定める（Codex はクラウド PR レビュー専任でローカルファイル・env に触れない）。enforcement の実装は `.claude/settings.json` deny + `pre-tool-guard.sh`、規約の正本はこの節に置く。

**触ってよい（読み書き可）**:

- `.env.example` — `op://` 参照スキーマの雛形。secret を含まないため、env var 追加時は agent が雛形更新まで完結する
- `.op-env.local` / `.op-env.local.example` — 中身は `op://` 参照のみで実秘密なし

**触らない（読みも書きもしない）**:

- `.env` / `.env.local` / `.env.*.local` / `.env.development` / `.env.staging` / `.env.production` / `.envrc` / `supabase/.env*` — 通常は存在しないが、`vercel env pull` などで一時的に実値入りで生成されうる。読むと実値が agent の会話ログに載り、方針 4「値を表示しない」に反する

secret の**利用**は制限しない。agent は `op run` 経由（`pnpm dev`、MCP の自己解決起動など）で値を見ずに secret を使う。これが 1Password 移行後の設計であり、実値ファイルを読める必要はない。

### API 経由の設定読戻し

上記はファイルの読み書きを対象とする。別経路として、設定系 API（Supabase Management API、Vercel Env API、Stripe API 等）の GET レスポンスに secret が同梱されるケースがある。**レスポンスをそのまま表示しない**。`jq` で必要フィールドだけに射影してから表示する（allowlist 方式）。`*_secret` / `*_key` / `*_token` / `*password*` を含むキーは射影に含めない。

射影を書けない・レスポンス構造が不明な場合は、まず `jq 'keys'` でキー一覧だけを確認してから射影を組む。

例: Supabase Auth config から bot protection の有効状態だけを確認する（`security_captcha_secret` のような `*_secret` フィールドは射影から除外する）:

```bash
curl -s "https://api.supabase.com/v1/projects/{ref}/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | jq '{security_captcha_enabled, external_email_enabled, disable_signup}'
```

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

| Item              | Fields                                                                                                                                                                                                                                                                                                                                               | 用途                                                  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `supabase`        | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET`                                                                                                                                                                   | Supabase local / preview 相当の接続                   |
| `upstash`         | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                                                                                                                                                                                                                 | Redis rate limit / cache                              |
| `stripe-test`     | `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_LIVEMODE`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`                                                                                                                                                                                                                              | Stripe test mode                                      |
| `resend`          | `RESEND_WEBHOOK_SECRET`                                                                                                                                                                                                                                                                                                                              | optional stagingのProduct webhook署名                 |
| `app`             | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `RECOVERY_CODE_PEPPER`, `OAUTH_CLAUDE_REDIRECT_URIS`, `OAUTH_CHATGPT_REDIRECT_URIS`, `OAUTH_CURSOR_REDIRECT_URIS`, `MCP_OAUTH_ENVIRONMENT`, `OAUTH_AUTHORIZATION_SERVER_URI`, `MCP_CANONICAL_RESOURCE_URI`, `MCP_OAUTH_PREVIEW_BRANCH`, `MCP_OAUTH_PREVIEW_UPSTASH_HOST`, `MCP_WRITE_ENABLED_CLIENTS` | App URL / recovery code HMAC pepper / MCP OAuth beta  |
| `google-calendar` | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_PROJECT_NUMBER`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `CALENDAR_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_REDIRECT_URIS`                                                                                                                                                                                     | 外部カレンダー取り込みの OAuth client（local dev 用） |

### `Dayopt-Production`

本番 secret は通常ローカルから参照せず、Vercel / Supabase Dashboard へ replica として同期する。Sentry は Product / Web で project を分離するため、metadata / DSN の item も分ける。

| Item              | Fields                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase`        | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `CRON_SECRET`, `SEND_EMAIL_HOOK_SECRET`                                                                                                     |
| `upstash`         | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                                                                                                                                                                                                                   |
| `stripe-live`     | `STRIPE_SECRET_KEY`, `STRIPE_ACCOUNT_ID`, `STRIPE_LIVEMODE`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID`                                                                                                                                                                |
| `resend`          | `RESEND_WEBHOOK_SECRET`（Product）                                                                                                                                                                                                                                                     |
| `resend-web`      | `RESEND_WEBHOOK_SECRET`（Web、Productと別値）                                                                                                                                                                                                                                          |
| `sentry`          | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`（Product）                                                                                                                                                                                                      |
| `sentry-web`      | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`（Web）                                                                                                                                                                                                          |
| `app`             | `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `RECOVERY_CODE_PEPPER`, `OAUTH_CLAUDE_REDIRECT_URIS`, `OAUTH_CHATGPT_REDIRECT_URIS`, `OAUTH_CURSOR_REDIRECT_URIS`, `MCP_OAUTH_ENVIRONMENT`, `OAUTH_AUTHORIZATION_SERVER_URI`, `MCP_CANONICAL_RESOURCE_URI`, `MCP_WRITE_ENABLED_CLIENTS` |
| `google-calendar` | `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_PROJECT_NUMBER`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `CALENDAR_TOKEN_ENCRYPTION_KEY`, `GOOGLE_CALENDAR_REDIRECT_URIS`                                                                                                                       |
| `google-auth`     | `SUPABASE_AUTH_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_GOOGLE_SECRET`                                                                                                                                                                                                                        |

`google-auth` は Supabase Auth の Google provider（ソーシャルログイン）用。**アプリの env には入らず、Supabase Dashboard だけが replica** になる（Dashboard Secrets 節を参照）。GCP project は `dayopt`（`dayopt-503623`）、client 名は `Dayopt Auth (Supabase)`、redirect URI は `https://yvglwblxrnrenfifsnje.supabase.co/auth/v1/callback` の 1 本だけ。

`google-calendar` は外部カレンダー取り込み（[#1702](https://github.com/Dayopt/dayopt/issues/1702)）専用の OAuth client で、Supabase Auth の Google provider とは別 client として作る。Supabase 側の client secret を流用しない。`GOOGLE_CALENDAR_PROJECT_NUMBER` は client ID の先頭にある project number と一致させる。

- `OAUTH_CLAUDE_REDIRECT_URIS` / `OAUTH_CHATGPT_REDIRECT_URIS` / `OAUTH_CURSOR_REDIRECT_URIS` はclientが発行する追加callback URIのcomma区切りexact allowlist。wildcardやoriginだけの緩い一致は使わない。既定callbackで足りるclientではfieldを空のままにする
- `MCP_OAUTH_ENVIRONMENT`はOAuth identityの環境marker。所有する環境はProductionと一時Previewの2つだけで、常設Stagingは作らない。一時Previewでは`preview`を必須とし、`VERCEL_ENV=preview`、`VERCEL_TARGET_ENV=preview`、branch、issuer、resourceのどれかが一致しなければbuildとruntimeを停止する。Productionは未設定時だけ既存originを既定値にする
- `OAUTH_AUTHORIZATION_SERVER_URI`と`MCP_CANONICAL_RESOURCE_URI`は環境ごとに固定するorigin。一時Previewでは同じstable branch URLを使い、transport path、query、fragment、Production originを含めない
- `MCP_OAUTH_PREVIEW_BRANCH`は検証対象PRのexact branch名。`VERCEL_GIT_COMMIT_REF`と一致しないPreviewを停止する。Productionには登録しない
- `MCP_OAUTH_PREVIEW_UPSTASH_HOST`は一時Preview専用Upstashのhost marker。接続先URLのhostと一致しないbuildを停止する。Productionには登録せず、ProductionのUpstashをPreviewへ複製しない
- `MCP_WRITE_ENABLED_CLIENTS`はruntime discovery/preflight用のclosed-beta allowlistであり、DBのglobal/client/connection gateを代替しない。未承認環境では空のままにする

- `CALENDAR_TOKEN_ENCRYPTION_KEY` は保存する refresh token を AES-256-GCM で暗号化する鍵。base64 で 32 バイトに decode できる値だけを受け付ける（`openssl rand -base64 32`）。鍵を失うと既存接続の token は復号できず、全ユーザーが再接続になる
- `GOOGLE_CALENDAR_REDIRECT_URIS` は comma 区切りの allowlist。callback は request host を allowlist と完全一致で引き、一致した文字列をそのまま Google へ渡す。Production には production origin だけを入れ、localhost を混ぜない（forwarded host 経由で allowlist を通過されうる）
- `STRIPE_ACCOUNT_ID` と `STRIPE_LIVEMODE` は、正しいStripe accountとmodeだけを変更するための固定identity。durable Billing / account deletionを有効にする前に、`STRIPE_SECRET_KEY` と3項目をまとめて設定する。test modeは `false`、live modeは `true`
- Preview は登録しない。ephemeral hostname は Google 側に事前登録できず、`__Host-` cookie も host 固定のため、Preview では接続開始時に明示エラーを返す

### `Dayopt-Shared`

| Item                     | Fields                                                                                        | 用途                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `turnstile`              | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`                                      | Cloudflare Turnstile                                            |
| `anthropic`              | `ANTHROPIC_API_KEY`                                                                           | optional / legacy key。現行runtime consumerなし                 |
| `resend`                 | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`                                                         | Product / WebのProduction email sending master                  |
| `resend-support-replies` | `RESEND_SMTP_API_KEY`                                                                         | Gmail Send mail as専用。Sending access / domain限定             |
| `sentry`                 | `SENTRY_AUTH_TOKEN`                                                                           | Product / Web の Production release upload                      |
| `github-login`           | password, TOTP, recovery codes                                                                | GitHub account login                                            |
| `github-ssh`             | SSH private key                                                                               | GitHub SSH Agent                                                |
| `vercel`                 | `VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID_STAGING`, `VERCEL_PROJECT_ID_PRODUCTION` | Production Config Audit / Production Release / project metadata |
| `google`                 | `GOOGLE_SITE_VERIFICATION`, `YANDEX_VERIFICATION`, `YAHOO_VERIFICATION`                       | Webmaster verification                                          |
| `domain`                 | registrar login, TOTP, recovery codes                                                         | dayopt.app 管理                                                 |
| `recovery-codes`         | service-specific recovery code index                                                          | 横断確認用。正本は各 Login item 側                              |

`VERCEL_TOKEN`はautomation専用とし、local CLIのloginや`--token`引数には使わない。Production Config AuditとProduction Releaseが環境変数からprocess内で読み、Authorization headerにだけ設定する。Production Releaseはenv metadataの読取に加えて、Production deploymentのpromoteとrollbackを行う。localの確認方法とrotation順序は[Environment Secrets](./security/environment-secrets.md)を正とする。

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
- `secrets:check` — tracked files と untracked `.env*` を scan し、literal secret は `value: [redacted]` で報告する。CI でも全 PR / push で走る（`docs-guard.yml` の `secrets-check` job）

secret scan は 2 本立てで、担当範囲が違う。gitleaks は「この PR で新しく入った commit 範囲」だけを見る（全履歴には削除済みプレースホルダ由来の既知ノイズが積もっており、毎回 re-flag すると gate として機能しなくなるため）。`secrets:check` は「現在の tracked tree 全体」を見る。片方だけでは、既に main に入っている literal が誰にも検出されない。

- `1password:check` — 1Password の vault / item / field / empty 状態だけを確認する。schemaで`required: true`のentryまたはoperational itemが不足・空の場合だけ失敗し、optional entryは不足・空の状態を表示しても成功する。item の作成・変更・削除はしない

`.op-env.local.example` の `op://` 参照は正規の local injection schema なので leak として扱わない。

---

## External Replicas

### Vercel Env

Vercel Production Env は runtime / build 用の replica。1Password を先に更新し、必要な値だけ Vercel Dashboard に手動同期する。Vercel 側で値を直接変更した場合は、必ず同じ変更を 1Password master に戻す。

Vercel Preview の Supabase env vars は Supabase Vercel integration が PR Preview Branch credentials を注入する。Preview scope に production Supabase credentials を手動設定しない。

Contact送信用の`RESEND_API_KEY` / `RESEND_FROM_EMAIL`とapp別`RESEND_WEBHOOK_SECRET`はProduct / WebのProductionだけへ同期する。送信credentialはPreview / Developmentへ置かない。Vercel metadataは`scripts/production-config-audit.mjs`でkey / target / typeだけを確認する。

旧`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO`のVercel replicaは削除済みで、専用PATも失効済みである。current schemaの新規作成対象から外し、`Production Config Audit`が再設定を常時拒否する。経緯は[問い合わせメール運用](./contact-email.md)を参照する。

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
