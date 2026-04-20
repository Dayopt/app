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
npm run dev              # 開発サーバー（.env.local を参照）
npm run dev:op           # 1Password op-run 経由（.op-env.local、Phase 1）
npm run env:check        # op references の解決確認
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

## コーディング規範（必須パターン）

型・ログ・通信・スタイル・構造の各レイヤで、この形に従うこと。詳細は [`.claude/rules/`](.claude/rules/) に委ねる。

- **型**: 具体的な型を書く。union variance の逃げは `as never`。例: `type Status = 'idle' | 'loading'` / `value as never`
- **ログ**: `@/lib/logger` で構造化ログを出す。例: `logger.info({ userId }, 'entry saved')`
- **通信**: tRPC / TanStack Query でサーバーデータを取得。例: `const { data } = api.entries.list.useQuery({ date })`
- **スタイル**: Tailwind のセマンティックトークンで書く。例: `<div className="bg-card text-foreground p-4" />`
- **export**: named export を使う（App Router 特殊ファイルのみ `export default` 例外）。例: `export function EntryCard() {}`
- **Component**: 関数宣言で props 型を直接注釈する。例: `export function Foo({ id }: { id: string }) {}`
- **Feature 間参照**: 他 feature の結合は Composition Layer（ページ/ルート）で行う。例: `src/app/(app)/calendar/page.tsx` で合成
- **依存方向**: `features/ → lib/` の一方向。`lib/` は feature 非依存の再利用コードだけを置く
- **Import 経路**: feature barrel（`index.ts`）から import する。例: `import { EntryCard } from '@/features/entries'`
- **ファイル命名**: 責務を表す具体名で切る。例: `formatDuration.ts` / `dateRangeFilter.ts`（`utils.ts` / `helpers.ts` は不可）
- **新規トップレベル feature 追加**: `features/` 直下に新 feature を作る前に相談する（プロセス要件のためネガティブ形のまま維持）

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

| ファイル                  | 内容                                                            |
| ------------------------- | --------------------------------------------------------------- |
| `ai-behavior.md`          | 拡張思考レベル、モデル選択、曖昧指示への対応                    |
| `architecture.md`         | tRPC 3層パターン、状態管理、環境構成                            |
| `code-style.md`           | 型安全、セキュリティ、依存関係追加基準                          |
| `design-system.md`        | セマンティックトークン、elevation、spacing                      |
| `feature-boundaries.md`   | DAGレイヤーモデル、Composition Layer                            |
| `quality.md`              | テスト優先度、A11y、パフォーマンス基準                          |
| `temporal-constraints.md` | 過去ブロックの編集制約                                          |
| `mcp-usage.md`            | MCP サーバーの呼び出し基準（Sentry/Supabase/Context7/Eagle 他） |
| `skill-design.md`         | Skill 設計原則、類型、境界設計、記述書式                        |

## スキル

`.claude/skills/` に11スキルが自動発動で利用可能:

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update

## デプロイ

- **IMPORTANT**: Staging branch と Production を同時に触らない
- Staging branch → 開発者が確認 → 指示後に Production へ
- `supabase functions deploy --use-api`（Docker不要）
