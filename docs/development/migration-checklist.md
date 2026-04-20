# マイグレーション & リリース チェックリスト

## 運用モデル（1 project + branches）

Dayopt は 1 Supabase project + persistent staging branch + ephemeral preview branches で運用する。git の世界観（`main` = production / `staging` = persistent / `feat/*` = preview）と揃える。

| 環境           | 実体                        | ライフサイクル              | migration 適用方法                                   |
| -------------- | --------------------------- | --------------------------- | ---------------------------------------------------- |
| **Preview**    | Supabase preview branch     | PR open〜close（ephemeral） | Supabase GitHub integration が PR で自動適用         |
| **Staging**    | persistent branch `staging` | 長命・固定URL               | 手動 `supabase db push`（hotfix / Stripe 検証用）    |
| **Production** | main project                | 永続                        | Supabase GitHub integration が main merge で自動適用 |
| **Local**      | `supabase start`            | 任意                        | `supabase db reset --local`                          |

> **過渡状態**: Pro plan への移行と GitHub integration 有効化が完了するまでは、従来の 2 project（Staging project + Production project）運用が継続する。CI workflow は `.github/workflows/supabase-migration.yml` の transitional モードで動作し、本書の「暫定フロー」節に従う。

## リリースフロー全体像

```
feature branch → PR open
                  ├── Vercel: preview deploy
                  └── Supabase: preview branch 自動生成 + migration 自動適用

feature branch → main merge
                  ├── Vercel: 本番デプロイ
                  └── Supabase: production に migration 自動適用
                                    （preview branch merge 連動）

staging branch（persistent）は Stripe 検証 / hotfix / closed beta 専用
  └── 手動で `supabase db push` してから検証
```

## マイグレーション手順（新モデル）

### 1. 作成

```bash
# 差分確認
supabase db diff

# ファイル生成
npm run migration:create <migration_name>

# supabase/migrations/YYYYMMDDHHMMSS_<migration_name>.sql を編集
```

### 2. ローカル検証

```bash
# ローカル DB に適用
npm run db:reset

# seed 投入
npm run db:seed   # ※ db:fresh = reset + seed

# アプリで動作確認
npm run dev
```

### 3. Preview branch で検証（PR open 時）

PR を open すると Supabase GitHub integration が自動で preview branch を作成し、新規 migration を適用する。Vercel preview はこの branch を向く。

- 手動操作は不要（integration が全てを行う）
- 失敗時は Supabase dashboard → Branches から logs を確認

### 4. Production 適用（main merge 時）

main merge と同時に Supabase GitHub integration が production project に migration を自動適用する。

- 手動 `db push` は**原則禁止**（整合性が崩れる）
- 例外: hotfix を staging branch でのみ検証したい場合（次節）

### 5. Staging branch で hotfix / Stripe 検証する場合

staging branch は persistent。データを残したまま検証用スキーマ変更を先行適用する特殊ケース。

```bash
# staging branch に link
supabase link --project-ref <production-ref> --branch staging

# push
supabase db push
```

> ⚠️ staging branch への手動 push は「feature flag 的」な扱い。本番適用前に必ず PR 経由で main に戻すこと。

## 暫定フロー（Pro 契約 + GitHub integration 完了まで）

過渡期は 2 project 運用のまま:

- Staging project: `yvglwblxrnrenfifsnje`
- Production project: `qloztwfbrbqtjijxicnd`

### Staging 適用

```bash
supabase link --project-ref yvglwblxrnrenfifsnje
supabase db push
```

### Production 適用

```bash
supabase link --project-ref qloztwfbrbqtjijxicnd
supabase db push
```

CI: `.github/workflows/supabase-migration.yml` が main merge 時に両方へ順次 push。Pro 移行完了後、この workflow は GitHub integration に置換される。

## マイグレーション統合時の注意

マイグレーションファイルをリナンバー / 統合する場合:

- [ ] 全マイグレーションの意味が統合後も保持されているか確認
- [ ] `IF NOT EXISTS` / `IF EXISTS` で冪等化
- [ ] preview branch で検証後、main merge でまとめて適用
- [ ] 統合前後で `supabase db diff` が空になることを確認

## リリース手順

### 通常リリース

1. feature branch で開発
2. PR を作成 → preview branch + Vercel preview で検証
3. レビュー通過後 main merge → Vercel 本番デプロイ + Supabase migration 自動適用
4. Production で動作確認

### バージョンタグ（任意）

```bash
# 記録目的のみ
git tag v0.X.0
git push origin v0.X.0
# → GitHub Actions が Release を自動作成
```

タグは**デプロイトリガーではない**。main merge がデプロイトリガー。

### スキーマ変更を含むリリースの順序

| 変更種別         | 順序の原則                                   |
| ---------------- | -------------------------------------------- |
| 新カラム追加     | **先に DB**、後にアプリ（デフォルト値必須）  |
| カラム削除       | **先にアプリ**（参照除去）、後に DB          |
| 型変更           | 2 段階（新カラム追加 → backfill → 旧削除）   |
| NOT NULL 追加    | 先に backfill で全行埋める → 制約追加        |
| RLS ポリシー変更 | 新ポリシー追加 → アプリ更新 → 旧ポリシー削除 |

## 関連

- skill: `.claude/skills/supabase/SKILL.md`
- rule: `.claude/rules/architecture.md` の「環境構成」節
- workflow: `.github/workflows/supabase-migration.yml`
