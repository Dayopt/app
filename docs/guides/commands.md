---
status: current
last_verified: 2026-06-23
---

# 開発コマンド一覧

Dayoptプロジェクトで使用可能な全npmコマンドのリファレンス。

---

## 基本開発コマンド（頻出）

```bash
pnpm dev                    # 1Password 経由で開発サーバー起動
npm run typecheck           # 型チェック
npm run lint                # コード品質チェック
npm run lint:boundaries     # feature境界チェック
npm run test:run            # ユニットテスト実行
npm run check               # typecheck + lint + test:run（一括）
```

> **Secrets**: 実値は `.env.local` に置かず、1Password master と `.op-env.local` の `op://` 参照を `pnpm dev` で注入する。`pnpm dev` は通常 Supabase local を参照する。素の起動が必要な一時作業だけ `pnpm dev:raw`、`.op-env.local` の Supabase refs をそのまま使う時だけ `DAYOPT_SUPABASE_TARGET=op pnpm dev` を使う。詳細は `docs/operations/secrets.md`。
> 開発サーバー（`pnpm dev`, `npm run storybook`）の起動・停止はユーザー責務。

---

## 全コマンド一覧

### 開発サーバー

```bash
pnpm dev                    # .op-env.local + op run 経由で next dev
pnpm dev:raw                # 素の next dev（一時作業用）
npm run storybook           # Storybook（ポート6006）
```

### ビルド

```bash
npm run build               # next build
npm run build-storybook     # Storybook ビルド
npm run bundle:analyze      # バンドル解析付きビルド
```

### コード品質

```bash
npm run lint                # ESLint（--max-warnings 0）
npm run lint:fix            # ESLint 自動修正
npm run lint:boundaries     # feature間の直接importを検出
npm run lint:boundaries:update  # 許可リスト更新
npm run lint:tokens         # Tailwindセマンティックトークンチェック
npm run typecheck           # tsc --noEmit
npm run format              # Prettier フォーマット
npm run format:check        # Prettier チェックのみ
```

### テスト

```bash
npm run test                # Vitest（watchモード）
npm run test:run            # Vitest（1回実行）
npm run test:unit           # ユニットテスト
npm run test:watch          # ウォッチモード
npm run test:ui             # Vitest UI
npm run test:coverage       # カバレッジ付き実行
npm run test:coverage:summary  # カバレッジサマリー表示
npm run test:diff-coverage  # 差分カバレッジ
npm run test-storybook      # Storybook テスト
npm run test:integration    # 統合テスト
npm run test:e2e            # Playwright E2Eテスト
npm run test:e2e:smoke      # E2Eスモークテスト
npm run test:e2e:critical   # E2Eクリティカルパス
npm run test:e2e:ui         # Playwright UIモード
npm run test:e2e:headed     # ブラウザ表示付きE2E
```

### Supabase / DB

```bash
npm run db:reset            # ローカルDB リセット
npm run db:reset-linked:unsafe # 手動リンク先をリセット（緊急時のみ）
npm run db:seed             # 開発データ投入
npm run db:fresh            # リセット + シード
npm run migration:create    # マイグレーション作成
npm run migration:list      # マイグレーション一覧
npm run migration:status    # DB差分確認
npm run types:generate          # Supabase production main から apps/product/src/lib/database に型生成
npm run types:generate:production # production main から apps/product/src/lib/database に型生成
npm run types:generate:local    # ローカルから apps/product/src/lib/database に型生成
```

### 環境変数

```bash
pnpm env:check           # secret 値を表示せず env の存在確認
pnpm secrets:check       # tracked files と untracked .env* の literal secret 検出
pnpm 1password:check     # 1Password schema の vault/item/field 存在確認
pnpm vercel:env          # Vercel 環境変数一覧
pnpm vercel:env:pull:unsafe  # apps/product/.env.local に一時同期
```

### i18n

```bash
npm run i18n:check          # 翻訳キーの整合性チェック
npm run i18n:unused         # 未使用の翻訳キーを検出
```

### セキュリティ・ライセンス

```bash
npm run license:check       # ライセンスチェック
npm run license:audit       # ライセンスサマリー
npm run license:report      # ライセンスCSVレポート
npm run security:audit      # npm audit（production）
npm run security:check      # npm audit（moderate以上）
npm run security:full       # audit + typecheck + lint
npm run security:audit:actions  # GitHub Actions監査
```

### パフォーマンス

```bash
npm run size                # バンドルサイズチェック
npm run size:why            # バンドルサイズ分析
npm run perf:lighthouse     # Lighthouse CI
npm run deps:circular       # 循環依存検出
npm run deps:outdated       # 古いパッケージ一覧
```

### ドキュメント

```bash
npm run docs:check          # コード-ドキュメント整合性
npm run docs:validate       # リンク + ルール検証
```

### Sentry

```bash
npm run sentry:test         # Sentry接続テスト
npm run sentry:verify       # Sentry設定検証
```

### Git ログ

```bash
npm run log:feat            # feat: コミットのみ表示
npm run log:fix             # fix: コミットのみ表示
npm run log:type            # 型別コミット一覧（最新20件）
```

---

## pre-commit フック（自動実行）

コミット時に以下が自動で実行される:

1. **lint-staged**: ステージされた `.ts/.tsx` に prettier + eslint
2. **typecheck**: `.ts/.tsx` ファイルが含まれる場合のみ `tsc --noEmit`
3. **license:check**: `package.json` 変更時のみライセンスチェック

---

**最終更新**: 2026-03-16
