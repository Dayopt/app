# 環境構成

Dayopt の標準ルートは `local → PR Preview → production`。Vercel Preview が production Supabase DB を触らないことを最優先にする。

## 環境一覧

| 環境           | Supabase                          | Vercel                          | URL              |
| -------------- | --------------------------------- | ------------------------------- | ---------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                      | localhost:3000   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview (`product`)      | `*.vercel.app`   |
| **Production** | `dayopt` main                     | main merge で Production deploy | `app.dayopt.app` |

persistent staging は常設しない。固定 URL が必要な Stripe / OAuth callback / closed beta 検証が出た時だけ、Vercel staging と Supabase persistent branch を追加する。

## Supabase Project

| Project | Reference ID           | Region | 用途                          |
| ------- | ---------------------- | ------ | ----------------------------- |
| dayopt  | `yvglwblxrnrenfifsnje` | Tokyo  | production main + PR branches |

Supabase GitHub integration が migrations / Edge Functions / Storage buckets の deployment owner。GitHub Actions から `supabase db push` は通常実行しない。

## 環境変数の管理

### 1Password master / replica

Secrets の正本は `docs/operations/secrets.md`。1Password は production / shared / optional staging の長寿命 secrets だけを管理する。PR Preview Branch credentials は 1Password に保存せず、Supabase / Vercel integration の ephemeral replica として扱う。

### Vercel environment

```txt
Production → Dayopt-Production の Supabase credentials
Preview    → Supabase Vercel integration が PR Branch credentials を注入
Development/local → .op-env.local + op run
```

Preview environment に production Supabase credentials を手動設定しない。残っている場合は削除または Preview scope から外す。

### `.op-env.local`

repository root の `.op-env.local.example` を `.op-env.local` にコピーし、`op://` 参照だけを書く。実値・dummy secret・placeholder secret は書かない。

## Local Development

```bash
supabase start
pnpm dev
```

`pnpm dev` は `op run` 経由のまま。デフォルトでは `supabase status -o env` から Supabase local の URL / anon key / service role key を取得し、値を表示せずに product app へ渡す。`.env.local` の実値保存は禁止。

一時的に `.op-env.local` の Supabase refs をそのまま使う場合だけ、明示的に切り替える。

```bash
DAYOPT_SUPABASE_TARGET=op pnpm dev
```

## Migration

詳細は `docs/guides/migration-checklist.md`。

- PR open: Supabase Preview Branch が作成され、migration と seed が適用される
- PR review: Vercel Preview が対応する Supabase Preview Branch を参照する
- main merge: Supabase integration が production に migration を適用する
- emergency only: 手動 `supabase db push`

## GitHub Actions Secrets

CI / E2E 用の build env は GitHub Secrets に残す。migration 用の `SUPABASE_ACCESS_TOKEN` / DB password は通常 workflow からは使わない。緊急手動 runbook 用に残す場合も、1Password master から同期し、値を出力しない。

## デプロイフロー

```txt
feature branch → PR
  ├── Supabase Preview Branch
  └── Vercel Preview (product)
        ↓
      review
        ↓
main merge
  ├── Supabase main deployment
  └── Vercel Production
```

## トラブルシューティング

| 症状                                   | 対処                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Supabase PR check が出ない             | Supabase GitHub integration / required check 設定を確認                        |
| Vercel Preview が production DB を見る | Vercel Preview env から production Supabase vars を削除し integration を再同期 |
| migration が Preview Branch で失敗     | Supabase deployment log を確認し、migration を修正して PR branch に push       |
| Production に反映されない              | Supabase GitHub integration の production deployment log を確認                |
