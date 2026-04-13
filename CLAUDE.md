# CLAUDE.md

## プロダクト方針

- **ターゲット**: 世界中の個人ユーザー（B2Bではない）
- **差別化**: タイムボクシング × 時間記録 × タスク × カレンダーの一体化
- **ゴール**: GoogleカレンダーやTogglと同等の「装飾のない基本体験」

## Tech Stack

Next.js 15 (App Router) / React 19 / TypeScript strict / Tailwind CSS v4 / Zustand / Supabase / tRPC v11 / Zod / shadcn/ui / Sentry

## コマンド

```bash
# 開発（AIは実行しない）
npm run dev              # 開発サーバー
npm run storybook        # Storybook

# 検証（AI必須：コード変更後）
npm run typecheck        # 型チェック
npm run lint             # コード品質
npm run lint:boundaries  # feature境界チェック
npm run lint:tokens      # デザイントークン検証（トークン変更時）
npm run lint:i18n        # i18n整合性チェック（翻訳キー変更時）

# テスト
npm run test:run         # ユニットテスト（ロジック変更後）
npm run test:integration # 統合テスト
npm run test:e2e:smoke   # E2Eスモークテスト

# 型生成・DB
npm run types:generate:staging  # Supabase型生成（staging）
npm run migration:create        # マイグレーション作成
npm run db:fresh                # ローカルDB初期化+シード

# 品質
npm run quality:deadcode # 未使用コード検出（knip）
```

## 絶対禁止

- `any` / `unknown` / `Function` / `as any` → 具体的な型、`as never`
- `console.log` → `@/lib/logger`
- `useEffect`でのfetch → tRPC / TanStack Query
- `style`属性 / 直接カラー(`text-blue-500`) → セマンティックトークン
- `export default`（App Router特殊ファイル例外） → named export
- `React.FC` → `export function ComponentName() {}`
- `@/features/X` を他featureから直接import → Composition Layer経由
- `features/` 内に新しいトップレベルfeatureを勝手に作らない → 相談すること
- `lib/` から `features/` をimportしない → 依存方向は features → lib のみ
- barrel（`index.ts`）以外のdeep importをしない → `@/features/X` 経由のみ
- `utils.ts` / `helpers.ts` という名前のファイルを作らない → 責務を表す具体名にする

## ワークフロー

1. **Explore**: 既存コードを検索、影響範囲を把握
2. **Plan**: 実装戦略を策定（`think hard`〜`ultrathink`で検討）
3. **Code**: CLAUDE.md + rules/ 準拠で実装
4. **Commit**: typecheck → lint → lint:boundaries → コミット
   - トークン変更時: `lint:tokens` も実行
   - 翻訳キー変更時: `lint:i18n` も実行

### コミットメッセージ

- **日本語で記述する**
- Conventional Commits形式: `feat(scope): 説明`, `fix(scope): 説明`

| prefix     | 用途                           |
| ---------- | ------------------------------ |
| `feat`     | 新機能追加                     |
| `fix`      | バグ修正                       |
| `refactor` | 機能変更なしのコード改善       |
| `chore`    | ビルド、CI、依存関係、設定変更 |
| `docs`     | ドキュメントのみの変更         |
| `test`     | テストの追加・修正             |
| `perf`     | パフォーマンス改善             |

## ルール体系

詳細ルールは `.claude/rules/` に分離。CLAUDE.md は概要のみ記載。

| ファイル                  | 内容                                         |
| ------------------------- | -------------------------------------------- |
| `ai-behavior.md`          | 拡張思考レベル、モデル選択、曖昧指示への対応 |
| `architecture.md`         | tRPC 3層パターン、状態管理、環境構成         |
| `code-style.md`           | 型安全、セキュリティ、依存関係追加基準       |
| `design-system.md`        | セマンティックトークン、elevation、spacing   |
| `feature-boundaries.md`   | DAGレイヤーモデル、Composition Layer         |
| `quality.md`              | テスト優先度、A11y、パフォーマンス基準       |
| `temporal-constraints.md` | 過去ブロックの編集制約                       |

## スキル

`.claude/skills/` に11スキルが自動発動で利用可能:

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update

## デプロイ

- **IMPORTANT**: StagingとProductionを同時にデプロイしない
- Staging → 開発者が確認 → 指示後にProductionへ
- `supabase functions deploy --use-api`（Docker不要）
