---
status: frozen
last_verified: 2026-07-14
---

# Vercel environment variable scope audit

Issue #1558 の残項目として、Vercel team `Dayopt` の `product` / `web` を再監査した。
値は取得せず、Vercel API が返す key、type、target と repository 内の利用箇所だけを確認した。

## Sensitive 指定

Production / Preview にある server-only secret は `sensitive` になっている。

| Project   | Env                         | Production | Preview   | Development |
| --------- | --------------------------- | ---------- | --------- | ----------- |
| `product` | `SUPABASE_SERVICE_ROLE_KEY` | sensitive  | n/a       | n/a         |
| `product` | `RECOVERY_CODE_PEPPER`      | sensitive  | sensitive | encrypted   |
| `product` | `RESEND_API_KEY`            | sensitive  | sensitive | encrypted   |
| `product` | `RESEND_WEBHOOK_SECRET`     | sensitive  | n/a       | n/a         |
| `product` | `SENTRY_AUTH_TOKEN`         | sensitive  | sensitive | encrypted   |
| `product` | `GITHUB_TOKEN`              | sensitive  | sensitive | encrypted   |
| `web`     | `GITHUB_TOKEN`              | sensitive  | sensitive | encrypted   |

Production の DB password、service key、JWT secret、Redis token も `sensitive`。
`NEXT_PUBLIC_*`、DSN、repository 名、送信元 email は公開設定であり、secret として扱わない。
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` は public key のため、現在の `sensitive` 指定は不要だが安全側の過剰分類であり、値の復旧元を確認するまでは変更しない。

## Preview scope の判断

| Env                    | 判断 | 理由                                                                                  |
| ---------------------- | ---- | ------------------------------------------------------------------------------------- |
| `RECOVERY_CODE_PEPPER` | 維持 | Preview build も `NODE_ENV=production` で、env validation と recovery code 処理に必要 |
| `SENTRY_AUTH_TOKEN`    | 維持 | Preview sourcemap upload にだけ使う build-time credential。`sensitive` のまま扱う     |
| `GITHUB_TOKEN`         | 削除 | Preview の contact form から production GitHub issue を作成できる権限は不要           |
| `RESEND_API_KEY`       | 削除 | Preview から実メールを送信できる長寿命 credential は不要                              |

## Development scope の判断

Vercel Development env は local の正規経路ではない。local は `.op-env.local` と `op run` を使うため、
`RECOVERY_CODE_PEPPER`、`RESEND_API_KEY`、`SENTRY_AUTH_TOKEN`、`GITHUB_TOKEN` の Development replica は削除する。

## 未適用項目

削除対象は Vercel から値を再取得できない。2026-07-14 の確認時は 1Password CLI が未認証で、
`pnpm 1password:check` が master の存在を確認できなかったため、復旧元を確かめず削除しなかった。
1Password へ再認証後、値を表示せず `pnpm 1password:check` を通してから削除し、Vercel metadata を再確認する。

## 関連

- Stock: `docs/operations/security/environment-secrets.md`
- Previous audit: `docs/operations/log/2026-07-08-vercel-predeploy-security-audit.md`
- Issue: #1558
