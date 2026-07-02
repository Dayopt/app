---
status: current
last_verified: 2026-06-17
---

# マイグレーション & リリース チェックリスト

## 運用モデル

Dayopt の標準ルートは `local → PR Preview → production`。

- **Supabase project**: `dayopt`
- **Project ref**: `yvglwblxrnrenfifsnje`
- **Local**: `supabase start` と `pnpm dev` (`op run`) を使う
- **PR Preview**: PR ごとの Supabase Preview Branch と Vercel Preview を使う
- **Production**: `main` merge 後だけ Supabase main と Vercel Production に反映する

| 環境           | Supabase                          | Vercel                         | 用途                         |
| -------------- | --------------------------------- | ------------------------------ | ---------------------------- |
| **Local**      | `supabase start`                  | `pnpm dev`                     | 手元の開発                   |
| **PR Preview** | PR ごとの Supabase Preview Branch | Vercel Preview URL (`product`) | migration / 機能の本番前検証 |
| **Production** | `dayopt` main                     | Production deployment          | 実ユーザー                   |

persistent staging は標準ルートでは使わない。固定 URL が必要な Stripe / OAuth / closed beta 検証が発生した時だけ、Vercel staging と Supabase persistent branch を追加する。

## Integration Setup

Supabase Dashboard で `dayopt` project に GitHub integration を接続する。

- Repository: `Dayopt/dayopt`
- Working directory: `.`
- Production branch: `main`
- Automatic branching: enabled
- Deploy to production: enabled
- Preview Branch seed: `supabase/seed.sql`

Supabase Vercel integration は `product` Vercel project のみに接続する。`web` は今回の Supabase Preview Branch 切替対象外。

GitHub branch protection では Supabase integration の required check を有効化する。これにより、Preview Branch への migration 適用が失敗した PR は merge できない。

## リリースフロー全体像

```txt
feature branch → PR open
                  ├── Supabase: Preview Branch 作成 + migration 適用 + seed
                  └── Vercel: product Preview が Preview Branch env を参照

PR review → checks pass → main merge
                  ├── Supabase: main/production に migration 適用
                  └── Vercel: product Production deploy
```

Vercel Preview は production Supabase DB を参照しない。PR close / merge 後の Preview Branch は Supabase 側で削除または停止される。

## マイグレーション手順

### 1. 作成

```bash
npm run migration:create <migration_name>
# supabase/migrations/YYYYMMDDHHMMSS_<migration_name>.sql を編集
```

### 2. ローカル検証

```bash
supabase start
npm run db:reset
npm run db:seed
pnpm dev
```

### 3. PR Preview 検証

PR を作成すると Supabase GitHub integration が Preview Branch を作成し、`supabase/migrations/**` を適用する。Vercel integration が `product` の Preview deployment に対応する Supabase env vars を注入する。

確認すること:

- Supabase PR check が green
- Vercel Preview が production DB ではなく Preview Branch を参照している
- migration に依存する機能が Preview URL で動く
- seed data だけで動作確認でき、本番データを必要としない

### 4. Production 適用

`main` merge 後、Supabase GitHub integration が production に migration を適用する。GitHub Actions から `supabase db push` は実行しない。

## Emergency Runbook

通常運用では手動 `supabase db push` を使わない。Supabase integration 障害などで緊急対応が必要な場合だけ、Production の 1Password secret を使い、作業ログに理由を残して実行する。

```bash
supabase link --project-ref yvglwblxrnrenfifsnje
supabase db push --dry-run
supabase db push
```

## マイグレーション統合時の注意

- [ ] RLS が有効で、`auth.uid() = user_id` の境界が維持されている
- [ ] `IF NOT EXISTS` / `IF EXISTS` で冪等化している
- [ ] ローカルで `db:reset` が通る
- [ ] Supabase Preview Branch check が green
- [ ] Production 適用前に Vercel Preview で主要導線を確認した

## スキーマ変更を含むリリースの順序

| 変更種別         | 順序の原則                                   |
| ---------------- | -------------------------------------------- |
| 新カラム追加     | 先に DB、後にアプリ（デフォルト値必須）      |
| カラム削除       | 先にアプリ（参照除去）、後に DB              |
| 型変更           | 2 段階（新カラム追加 → backfill → 旧削除）   |
| NOT NULL 追加    | 先に backfill で全行埋める → 制約追加        |
| RLS ポリシー変更 | 新ポリシー追加 → アプリ更新 → 旧ポリシー削除 |

## 関連

- skill: `.agents/skills/supabase/SKILL.md`
- architecture: `docs/architecture/platform/environments.md`
- secrets: `docs/operations/secrets.md`
