# AGENTS.md

Codex 用の入口。詳細ルールは既存の `.claude/rules/` を canonical source として参照し、Codex 固有の運用差分だけ `.codex/rules/` に置く。Claude と Codex で同じ規約を二重管理しない。

## Product North Star

- **Target**: 世界中の個人ユーザー。B2B ではない
- **Differentiator**: タイムボクシング、時間記録、タスク、カレンダーの一体化
- **Experience goal**: Google Calendar や Toggl と同等の、装飾のない基本体験
- **Tone**: 寡黙な研究者。数字で示し、煽らず、ユーザーの知性を信頼する

## Tech Stack

Next.js 15 App Router / React 19 / TypeScript strict / Tailwind CSS v4 / Zustand / Supabase / tRPC v11 / Zod / shadcn/ui / Sentry

## Commands

```bash
# 開発サーバー（AI は実行しない）
pnpm dev                     # 1Password op-run 経由
pnpm dev:raw                 # op run なしの緊急 escape hatch
pnpm env:check               # 値を出さない env 存在確認
pnpm secrets:check           # literal secret 検出（redacted）
pnpm 1password:check         # 1Password schema 確認（値は表示しない）
pnpm storybook               # Storybook

# 検証（コード変更後は必須）
pnpm check                  # CI Stage 1 + unit test 相当のローカル一括チェック（build/e2e は含めない）
pnpm typecheck
pnpm lint
pnpm lint:boundaries
pnpm lint:tokens             # token 変更時
pnpm lint:i18n               # 翻訳キー変更時

# テスト
pnpm test:run                # ロジック変更・バグ修正後
pnpm test:integration
pnpm test:e2e:smoke

# 型生成・DB
pnpm types:generate
pnpm types:generate:production
pnpm types:generate:local
pnpm migration:create
pnpm db:fresh

# 品質
pnpm quality:deadcode

# docs
pnpm docs:check               # リンク切れ/frontmatter/命名/append-only を検証（CI と同一）
```

## Non-Negotiables

- 既存コードを検索してから変更する。`rg` / `rg --files` を優先する
- 既存の未コミット差分はユーザー作業として扱い、勝手に revert / stage しない
- `git add .` は避ける。必ず path-limited add で scope を固定する
- コミット前に `git diff --cached` を確認する
- コード変更後は `pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries` を通す
- コミットメッセージは日本語 Conventional Commits 形式にする

  | prefix     | 用途                           |
  | ---------- | ------------------------------ |
  | `feat`     | 新機能追加                     |
  | `fix`      | バグ修正                       |
  | `refactor` | 機能変更なしのコード改善       |
  | `chore`    | ビルド、CI、依存関係、設定変更 |
  | `docs`     | ドキュメントのみの変更         |
  | `test`     | テストの追加・修正             |
  | `perf`     | パフォーマンス改善             |
- PR を merge する時は、枝分かれを履歴に残すため `gh pr merge --merge` を標準にする

## Coding Rules

詳細は `.claude/rules/` を読む。AGENTS.md には作業中に見失いやすい規約だけ載せる。

- **型**: 具体的な型を書く。variance の逃げは `as never`。`as any` は使わない
- **ログ**: `@/lib/logger` で構造化ログを出す。`console.log` は本番コードに残さない
- **通信**: サーバーデータは tRPC / TanStack Query 経由で扱う
- **スタイル**: Tailwind semantic token を使う。直接色、任意 spacing、style 属性を避ける
- **export**: named export を使う。App Router の特殊ファイルだけ `export default` を許可する
- **Component**: 関数宣言 + props 型の直接注釈を基本にする
- **Feature 境界**: feature 間の結合は Composition Layer で行う。feature barrel から import する
- **依存方向**: `features/ -> lib/` の一方向。`lib/` は feature 非依存の再利用コードだけ
- **命名**: `utils.ts` / `helpers.ts` を避け、責務を表す具体名にする
- **新規 top-level feature**: `features/` 直下に新 feature を作る前に相談する

## Docs 運用責務

`docs/README.md` の地図・決定木・書き方の約束に従う。とくに以下は都度・自発的に実施する:

- **フィードバックの記録** — ユーザーの声（感想・要望・不具合報告）が届いたら、その日のうちに `docs/product/log/YYYY-MM-DD-feedback-<slug>.md` に原文のまま記録する（`/note` コマンド参照）
- **障害の記録** — 障害・トラブルが起きたら `docs/operations/log/YYYY-MM-DD-incident-<slug>.md` に記録する。対応手順そのものの更新は `docs/operations/` 側に別途反映する
- **機能仕様の反映** — プロダクトの振る舞いを変えたら `docs/product/specs/` の該当ファイルを更新する
- **月次ガーデニング** — `docs/engineering/log/` に当月のロールアップファイル（`YYYY-MM-01-journal.md`）が存在しない状態でセッションが始まったら、`/gardening` の実施をユーザーに提案する

## コマンド一覧（.claude/commands/）

Claude Code は `Skill` tool、Codex は該当ファイルを直接読んで手動実行する。

| コマンド        | 内容                                                                     |
| --------------- | ---------------------------------------------------------------------- |
| `/decision`     | 各ドメインの `log/` に `YYYY-MM-DD-slug.md` で意思決定ログを新規作成         |
| `/plan-review`  | 直前の実装 plan を plan-fact-checker / plan-critic の 2 agent で並列レビュー |
| `/note`         | 各ドメインの `log/YYYY-MM-DD-slug.md` を新規作成（feedback-/incident- prefix対応） |
| `/session-end`  | 当日の作業を `docs/engineering/log/YYYY-MM-DD-session.md` に記録し `latest.md` を更新 |
| `/gardening`    | 月次: セッションログ→月次ロールアップ蒸留、ストック鮮度triage、notes昇格、スモークテスト |

## Rule Map

| ファイル | 使う場面 |
| --- | --- |
| `.claude/rules/ai-behavior.md` | plan の粒度、曖昧指示、AI 行動規範 |
| `.claude/rules/workflow.md` | 作業規模、設計書、git / merge 運用 |
| `.claude/rules/plan-format.md` | 実装 plan を提示する時 |
| `.claude/rules/architecture.md` | tRPC、状態管理、ロジック配置 |
| `.claude/rules/code-style.md` | 型、ログ、依存追加、eslint-disable |
| `.claude/rules/design-system.md` | UI、token、spacing、icon |
| `.claude/rules/copywriting.md` | UI 文言、トーン、CTA |
| `.claude/rules/feature-boundaries.md` | feature DAG、Composition Layer |
| `.claude/rules/quality.md` | test、a11y、performance |
| `.claude/rules/temporal-constraints.md` | 過去ブロック編集制約 |
| `.claude/rules/mcp-usage.md` | Sentry / Supabase / Context7 / Vercel / Eagle |
| `.claude/rules/skill-design.md` | project skill の設計・更新 |
| `.codex/rules/README.md` | Codex 固有の薄い overlay |

## Skills

Project skills は `.agents/skills/` を参照する。該当する作業では `SKILL.md` を先に読む。実体は `.claude/skills/` が正本で、`.agents/skills/` は各 skill への symlink（二重管理しない）。

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update / eagle-dayopt / audit-ai-config

## Workflow

1. **Explore**: 既存コード、rules、skills、関連 issue / PR を確認する
2. **Plan**: 大きい変更は `.claude/rules/plan-format.md` に沿って plan を出す。必要なら `/plan-review`
3. **Code**: 既存パターンに寄せて最小の変更を入れる
4. **Verify**: 変更種別に応じて必須コマンドを実行する
5. **Commit / PR**: path-limited add、`git diff --cached`、日本語 Conventional Commit

## Deploy / Release

- Staging branch と Production を同時に触らない
- Staging branch -> 開発者確認 -> 指示後に Production
- Supabase Edge Functions は `supabase functions deploy --use-api`
- release 意図が明示された時だけ `.agents/skills/releasing/SKILL.md` を使う
