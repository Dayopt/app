# 環境変数セットアップガイド

Dayopt Web の環境変数は 1Password を master として管理する。Secrets 運用の正本は `apps/storybook/docs/operations/secrets.mdx`。

---

## クイックスタート

ローカルでは repository root の `.op-env.local` に `op://` 参照だけを書く。

```bash
cp ../../.op-env.local.example ../../.op-env.local
op run --env-file=../../.op-env.local -- npm run dev
```

`.env.local` に実値を置く運用は廃止。Vercel CLI などで生成された `.env.local` は unsafe / temporary として扱い、作業後に削除する。

---

## 1Password / Replica

- **Master**: 1Password
- **Local replica**: `.op-env.local` の `op://` 参照
- **External replicas**: Vercel Env、GitHub Secrets、Supabase Dashboard secrets

変更時は 1Password を先に更新し、必要な replica へ手動同期する。確認は存在確認だけにし、値を terminal / docs / issue / chat に出さない。

---

## Web Env Names

| 変数名                           | 用途                         | 1Password item                     |
| -------------------------------- | ---------------------------- | ---------------------------------- |
| `NEXT_PUBLIC_APP_URL`            | 公開 URL                     | `Dayopt-Staging/app`               |
| `NEXT_PUBLIC_SITE_URL`           | SEO / OGP URL                | `Dayopt-Staging/app`               |
| `GITHUB_TOKEN`                   | Contact form の Issue 作成   | `Dayopt-Shared/github-contact-pat` |
| `GITHUB_CONTACT_REPO`            | Contact form の Issue 作成先 | `Dayopt-Shared/github-contact-pat` |
| `UPSTASH_REDIS_REST_URL`         | Rate limit                   | `Dayopt-Staging/upstash`           |
| `UPSTASH_REDIS_REST_TOKEN`       | Rate limit                   | `Dayopt-Staging/upstash`           |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Turnstile widget             | `Dayopt-Shared/turnstile`          |
| `TURNSTILE_SECRET_KEY`           | Turnstile siteverify         | `Dayopt-Shared/turnstile`          |
| `GOOGLE_SITE_VERIFICATION`       | Search Console               | `Dayopt-Shared/google`             |
| `YANDEX_VERIFICATION`            | Webmaster verification       | `Dayopt-Shared/google`             |
| `YAHOO_VERIFICATION`             | Webmaster verification       | `Dayopt-Shared/google`             |
| `PRIVACY_PROTECTION_MODE`        | Privacy display mode         | non-secret config                  |

`NODE_ENV`、`CI`、`VERCEL_URL` は runtime / platform が設定する。

---

## Type Safety

Web 側の env 型は `apps/web/src/platform/config/env.ts` が正。アプリケーションコードでは `env` helper を優先する。

```typescript
import { env, getAppUrl, isDevelopment } from '@/platform/config/env';

const repo = env.GITHUB_CONTACT_REPO;
const appUrl = getAppUrl();
```

---

## Local Testing

Contact form や Upstash rate limit をローカルで試す場合も、実値は `.env.local` に書かず 1Password に入れて `.op-env.local` の参照で注入する。

```bash
op run --env-file=../../.op-env.local -- npm run dev
```

Turnstile は canonical bot protection provider。reCAPTCHA の env は旧方式であり、新規設定には使わない。

---

## Production / Preview

Vercel Env は 1Password master から手動同期される replica。Vercel Dashboard で直接値を変更した場合は、同じ変更を 1Password に戻す。

GitHub Actions Secrets と Supabase Dashboard secrets も同じく replica として扱う。

---

## Troubleshooting

| 症状                         | 対処                                                       |
| ---------------------------- | ---------------------------------------------------------- |
| `op run` が signed in で失敗 | 1Password CLI の signin 状態を確認                         |
| env が missing になる        | `.op-env.local` の `op://` 参照と 1Password field 名を確認 |
| `.env.local` が生成された    | unsafe / temporary として扱い、作業後に削除                |

---

## 関連ファイル

- `apps/storybook/docs/operations/secrets.mdx` - Secrets 運用の正本
- `.op-env.local.example` - local injection 参照例
- `apps/web/src/platform/config/env.ts` - 環境変数の型定義とバリデーション
