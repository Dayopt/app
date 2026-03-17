# マイグレーション & リリース チェックリスト

## リリースフロー全体像

```
feature branch → PR → main マージ
                         ├── Vercel: 自動 Production デプロイ
                         └── GitHub Actions: Staging Supabase にマイグレーション自動適用

バージョン記録（任意）:
  git tag v0.X.0 → GitHub Actions → GitHub Release 作成
  ※ タグはデプロイトリガーではない（バージョン記録のみ）
```

## Supabase マイグレーション手順

### 1. マイグレーション作成

```bash
# 差分を確認
supabase db diff

# マイグレーションファイル作成
supabase migration new <migration_name>

# ファイルを編集
# supabase/migrations/YYYYMMDDHHMMSS_<migration_name>.sql
```

### 2. ローカルで検証

```bash
# ローカルDBにマイグレーション適用
supabase db reset --local

# アプリで動作確認
npm run dev
```

### 3. Staging 適用

```bash
# Staging プロジェクトにリンク
supabase link --project-ref yvglwblxrnrenfifsnje

# マイグレーション適用
supabase db push

# Staging環境で動作確認
```

> **注意**: `db push` は `--project-ref` 非対応。リンク済みプロジェクトに対して実行される。

### 4. Production 適用

```bash
# Production プロジェクトにリンク
supabase link --project-ref qloztwfbrbqtjijxicnd

# マイグレーション適用
supabase db push

# Production環境で動作確認
```

## マイグレーション統合時の注意

マイグレーションファイルを統合（リナンバー）する場合:

- [ ] 全マイグレーションの内容が統合後も保持されているか確認
- [ ] `IF NOT EXISTS` / `IF EXISTS` を使って冪等にする
- [ ] Staging と Production の両方に適用して検証
- [ ] 統合前後で `supabase db diff` の結果が空になることを確認

## リリース手順

### 通常リリース

1. feature branch で開発・テスト
2. PR を作成、レビュー
3. main にマージ → Vercel が自動デプロイ
4. Production で動作確認

### バージョンタグ（任意）

```bash
# バージョンを記録したい場合のみ
git tag v0.X.0
git push origin v0.X.0
# → GitHub Actions が GitHub Release を自動作成
```

タグは**デプロイトリガーではない**。main マージが Production デプロイのトリガー。

### Supabase マイグレーションを含むリリース

1. マイグレーションを先に Staging に適用して検証
2. PR を main にマージ（アプリデプロイ）
3. **直後に** Production Supabase にマイグレーション適用
4. アプリの動作確認

> DB変更とアプリデプロイの順序に注意。新カラムの追加は先にDB、カラム削除は先にアプリ。
