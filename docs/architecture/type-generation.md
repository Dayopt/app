# Supabase 型自動生成

Supabase CLIを使用して、データベーススキーマからTypeScript型定義を自動生成する。

---

## コマンド

| コマンド                            | ソース          | 用途                                      |
| ----------------------------------- | --------------- | ----------------------------------------- |
| `npm run types:generate`            | production main | `types:generate:production` の互換 alias  |
| `npm run types:generate:production` | production main | production main から生成                  |
| `npm run types:generate:local`      | Local DB        | ローカルから生成（`supabase start` 必要） |

PR Preview Branch の schema は Supabase integration check で検証する。型生成は production main か local のどちらかを明示して行う。

全コマンドとも `apps/product/src/lib/database/generated/database.types.ts` に出力。

---

## 使用タイミング

### 必須

- データベーススキーマを変更した後
- 新しいテーブルを追加した後
- カラムの型を変更した後

### 推奨

- 定期的（週1回程度）
- 本番環境のスキーマと同期を確認する

---

## ワークフロー

```bash
# 1. マイグレーション作成
npm run migration:create add_new_table
# マイグレーションファイルを編集

# 2. ローカルで適用確認
npm run db:reset

# 3. 型を再生成
npm run types:generate:local

# 4. 型チェック
npm run typecheck

# 5. コミット
git add apps/product/src/lib/database/generated/database.types.ts
git commit -m "chore(types): supabase型定義を更新"
```

---

## カスタム型

`apps/product/src/lib/database/generated/database.types.ts` は自動生成ファイル。**直接編集禁止**。

カスタム型が必要な場合は別ファイルに定義:

```typescript
// apps/product/src/lib/database/types.ts
import type { Database } from './generated/database.types';

export type PlanRow = Database['public']['Tables']['plans']['Row'];
export type TagRow = Database['public']['Tables']['tags']['Row'];
```

---

## トラブルシューティング

| エラー                 | 対処                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `project_id not found` | Supabase プロジェクトの存在を確認                                                            |
| `connection refused`   | ローカル: `supabase start` を実行 / リモート: ネットワーク確認                               |
| 生成された型がおかしい | production main か local のどちらから生成したか確認。local は `supabase db reset` でリセット |
