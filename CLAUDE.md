# CLAUDE.md

## プロダクト方針

- **ターゲット**: 世界中の個人ユーザー（B2Bではない）。中でも AI を使いこなす知的労働者を最初の楔とする
- **差別化**: タイムボクシング × 時間記録 × タグの一体化（Todo 管理は他ツールの領土。詳細は [`docs/strategy/concept.md`](docs/strategy/concept.md) 参照）
- **ゴール**: GoogleカレンダーやTogglと同等の「装飾のない基本体験」

プロダクトの最上位コンセプトは [`docs/strategy/concept.md`](docs/strategy/concept.md) を参照（すべての判断がこれに従う）。

## Tech Stack

Next.js 15 (App Router) / React 19 / TypeScript strict / Tailwind CSS v4 / Zustand / Supabase / tRPC v11 / Zod / shadcn/ui / Sentry

## コマンド

```bash
# 開発（AIは実行しない）
pnpm dev              # 1Password op-run 経由（.op-env.local）
pnpm dev:raw          # op run なしの緊急 escape hatch
pnpm env:check        # 値を出さない env 存在確認
pnpm secrets:check    # literal secret 検出（値は redacted）
pnpm 1password:check  # 1Password schema 確認（値は表示しない）
pnpm storybook        # Storybook

# 検証（AI必須：コード変更後）
pnpm typecheck        # 型チェック
pnpm lint             # コード品質
pnpm lint:boundaries  # feature境界チェック
pnpm lint:tokens      # デザイントークン検証（トークン変更時）
pnpm lint:i18n        # i18n整合性チェック（翻訳キー変更時）

# テスト
pnpm test:run         # ユニットテスト（ロジック変更後）
pnpm test:integration # 統合テスト
pnpm test:e2e:smoke   # E2Eスモークテスト

# 型生成・DB
pnpm types:generate          # Supabase型生成（production main、互換 alias）
pnpm types:generate:production # Supabase型生成（production main）
pnpm types:generate:local    # Supabase型生成（local）
pnpm migration:create        # マイグレーション作成
pnpm db:fresh                # ローカルDB初期化+シード

# 品質
pnpm quality:deadcode # 未使用コード検出（knip）
```

## コーディング規範（必須パターン）

型・ログ・通信・スタイル・構造の各レイヤで、この形に従うこと。詳細は [`.claude/rules/`](.claude/rules/) に委ねる。

- **型**: 具体的な型を書く。union variance の逃げは `as never`。例: `type Status = 'idle' | 'loading'` / `value as never`
- **ログ**: `@/lib/logger` で構造化ログを出す。例: `logger.info({ userId }, 'entry saved')`
- **通信**: tRPC / TanStack Query でサーバーデータを取得。例: `const { data } = api.entries.list.useQuery({ date })`
- **スタイル**: Tailwind のセマンティックトークンで書く。例: `<div className="bg-card text-foreground p-4" />`
- **export**: named export を使う（App Router 特殊ファイルのみ `export default` 例外）。例: `export function EntryCard() {}`
- **Component**: 関数宣言で props 型を直接注釈する。例: `export function Foo({ id }: { id: string }) {}`
- **Feature 間参照**: 他 feature の結合は Composition Layer（ページ/ルート）で行う。例: `apps/product/src/app/(app)/calendar/page.tsx` で合成
- **依存方向**: `features/ → lib/` の一方向。`lib/` は feature 非依存の再利用コードだけを置く
- **Import 経路**: feature barrel（`index.ts`）から import する。例: `import { EntryCard } from '@/features/entries'`
- **ファイル命名**: 責務を表す具体名で切る。例: `formatDuration.ts` / `dateRangeFilter.ts`（`utils.ts` / `helpers.ts` は不可）
- **新規トップレベル feature 追加**: `features/` 直下に新 feature を作る前に相談する（プロセス要件のためネガティブ形のまま維持）

## ワークフロー

1. **Explore**: 既存コードを検索、影響範囲を把握
2. **Plan**: 実装戦略を策定（`think hard`〜`ultrathink`で検討）。出力 format は [`rules/plan-format.md`](.claude/rules/plan-format.md)。承認前に `/plan-review` で fact-checker + critic に並列レビューさせる
3. **Code**: CLAUDE.md + rules/ 準拠で実装
4. **Commit**: `pnpm typecheck` → `pnpm lint` → `pnpm lint:boundaries` → コミット
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

### マージ方式

- **PR は merge commit でマージする**（squash / rebase は GitHub 設定で禁止済み）。理由＝ブランチの分岐を main の DAG に残し、開発の経緯を追えるようにするため
- merge commit では**ブランチ上の各コミットがそのまま main に載る**。よって 1 コミット単位で Conventional Commits 形式を守る（PR タイトルだけ整える squash 前提の運用ではない）
- マージ済みブランチは GitHub 側で自動削除される（`deleteBranchOnMerge`）。ローカルは `git branch -d` でマージ検出削除できる

## ルール体系

詳細ルールは `.claude/rules/` に分離。CLAUDE.md は概要のみ記載。

| ファイル                  | 内容                                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai-behavior.md`          | 拡張思考レベル、モデル選択、曖昧指示への対応                                                                                                                                                                   |
| `architecture.md`         | tRPC 3層パターン、状態管理、環境構成                                                                                                                                                                           |
| `code-style.md`           | 型安全、セキュリティ、依存関係追加基準                                                                                                                                                                         |
| `design-system.md`        | セマンティックトークン、elevation、spacing（アイコン運用は [`packages/foundations/src/tokens/IconConventions.mdx`](packages/foundations/src/tokens/IconConventions.mdx) / Storybook `Foundations/Icons/Docs`） |
| `feature-boundaries.md`   | DAGレイヤーモデル、Composition Layer                                                                                                                                                                           |
| `quality.md`              | テスト優先度、A11y、パフォーマンス基準                                                                                                                                                                         |
| `temporal-constraints.md` | 過去ブロックの編集制約                                                                                                                                                                                         |
| `mcp-usage.md`            | MCP サーバーの呼び出し基準（Sentry/Supabase/Context7/Eagle 他）                                                                                                                                                |
| `skill-design.md`         | Skill 設計原則、類型、境界設計、記述書式                                                                                                                                                                       |
| `plan-format.md`          | 実装 plan の必須セクション（Goal / Minimum Viable / Reversibility / Reuse / Not Doing）                                                                                                                        |

## スキル

`.claude/skills/` に11スキルが自動発動で利用可能:

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update

## デプロイ

- **IMPORTANT**: Staging branch と Production を同時に触らない
- Staging branch → 開発者が確認 → 指示後に Production へ
- `supabase functions deploy --use-api`（Docker不要）
