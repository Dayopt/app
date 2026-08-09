# CLAUDE.md

Dayopt で作業する Claude の正本ガイダンス。詳細ルールは `.claude/rules/` を canonical source とする。外部レビューは OpenAI Codex のクラウドレビュー（PR への `@codex review`）だけが担い、そのレビュー規則は `AGENTS.md` に置く。Codex が repo から読むのは `AGENTS.md` のみで、実装・運用のガイダンスを provider 別に二重管理しない。

## シンプルルール（判断層）

迷った瞬間に戻る 5 箇条。**機能の追加・優先順位・出荷・削除を判断する時にだけ**使う。typo 修正や既存パターンへの追従で持ち出すと官僚化するので使わない。

| #   | ルール                                             | 種別       |
| --- | -------------------------------------------------- | ---------- |
| 1   | **個人の 1 日が良くならないなら、作らない**        | 境界       |
| 2   | **迷ったら、計画と実績の距離を縮める方を選ぶ**     | 優先順位   |
| 3   | **Google Calendar / Toggl より一手少なく**         | 方法       |
| 4   | **不可逆だけ遅く、可逆は速く**                     | タイミング |
| 5   | **2 週間、自分が触らなかった機能は削除候補にする** | 停止       |

この 5 箇条は書き上がった規約ではなく、使いながらブラッシュアップしていく。月次ガーデニング（`.claude/commands/gardening.md`）で「使われているか」を検証し、ルールと違う判断をした時は理由を一文残す。**6 個目を足すときは、どれかを削る。** 設計原則の詳細は [strategy.md](docs/business/strategy.md) §4、協働の分担とテンポは次節が正本。

## 協働のかたち

前節の 5 箇条は User と Main が共有する判断層。どちらかがどちらかに従うのではなく、**両者がルールと証拠に従う。**

- **分担は上下ではなく、一次情報の違い。** User は自分の 1 日・違和感・引き受けるリスクという誰にも代われない一次情報を持つ。Main は codebase 全体と検証手段を持つ。だから Main は選択肢を丸投げせず証拠付きの推奨まで作り、User は体験の違和感を遠慮なく出す
- **忖度しない。** User の判断も検証対象。承認は test・レビュー・証拠の代替にならず、複数 agent の一致も証拠ではない。ルールや証拠が別を指すとき、根拠と代案を添えて反対するのは Main の責務（反対そのものを目的にしない）
- **質問・仮説・懸念は指示ではない。** 明示指示だけが承認で、前提や scope が変われば引き継がない
- **テンポはルール 4。** 可逆は速く = `AUTONOMOUS`（承認なしで進めて報告）。価値判断の境界で止まる = `CHECKPOINT`（顧客挙動・公開契約・権限/プライバシー。推奨と最悪ケースを短く添えて問う）。不可逆だけ遅く = `EXPLICIT AUTHORITY`（production mutation・release・データ削除・不可逆 migration・実課金。明示指示 + 独立レビュー + dry-run/backup が揃うまで実行しない。揃えられなければ実行せず failure mode を報告する）

subagent への委任・writer 境界・報告フォーマットなどの運用機構は [.claude/rules/ai-behavior.md](.claude/rules/ai-behavior.md) が正本。

## Tech Stack

Next.js App Router / React / TypeScript strict / Tailwind CSS / Zustand / Supabase / tRPC / Zod / shadcn/ui / Sentry。exact version は各 `package.json` と lockfile を正とする

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
pnpm docs:check               # link/metadata/path/project/命名/append-only を検証（CI と同一）
```

## Non-Negotiables

- 既存コードを検索してから変更する。`rg` / `rg --files` を優先する
- **repo 全体を洗う検索は `rg --hidden --glob '!.git/**'` で実行する。** `rg` は既定で dot ディレクトリを飛ばすため、`.claude/` `.github/` が丸ごと検索対象から外れる。撤去・改名の残存参照を探す時にこれを忘れると、AI 設定と workflow の参照だけが取り残される（2026-08-03 に実際に発生）。`--hidden` は `.git/` も対象に含めるため、glob 除外を同時に付ける（付けないと git のメタデータを拾う）
- issue の起票・worker への作業依頼・`status:blocked` issue への着手判断は `dispatch` skill（`.claude/skills/dispatch/SKILL.md`）の規約に従う。凍結 issue には着手しない
- 既存の未コミット差分はユーザー作業として扱い、勝手に revert / stage しない
- env ファイルの読み書き境界は `docs/operations/secrets.md` §AI エージェントの env ファイル境界 に従う。`.env.example` / `.op-env.local` は触ってよく、実値が入りうる `.env` / `.env.local` 系は読みも書きもしない
- `git add .` は避ける。必ず path-limited add で scope を固定する
- コミット前に `git diff --cached` を確認する
- コード変更後は `pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries` を通す
- コミットメッセージは日本語 Conventional Commits 形式にする（type は commitlint が強制。subject を Latin 大文字語で始めると `subject-case` で弾かれるため日本語で始める）
- PR は機能のまとまり単位で束ねる。サイズを理由に分割しない（`.claude/rules/workflow.md` §PR 粒度）
- PR は draft で作成する（`gh pr create --draft`）。ready 化は merge 直前に 1 回だけ行い、重量 CI（E2E / Web E2E / Production Config Audit）を merge 前 1 回に寄せる（`.claude/rules/workflow.md` §2 段階 CI）
- PR 本文に `Closes #N` を issue ごとに 1 行ずつ書き、merge で自動クローズさせる。`Closes #1, #2` は先頭しか閉じない。epic と部分対応は `Refs #N`（`.claude/rules/workflow.md` §PR と issue の紐づけ）
- PR は枝分かれを履歴に残すため merge commit でマージする。**マージ〜掃除は同一セッション内で `pnpm branch:finish <PR番号>` をワンセットで実行する**（マージ→worktree削除→ローカル/リモート branch 削除→main 最新化まで。完了定義 5 点と手動フォールバックは `.claude/rules/workflow.md` §Worktree 運用）
- branch 名は `{agent}/{domain}-{action}[-{issue番号}]` に統一する。複数 issue を束ねた場合は代表 issue または epic 番号を使う。Claude Code 自動生成のランダム名は最初の PR 作成前に `git branch -m` でリネームする（`.claude/rules/workflow.md` §命名規則）

## Coding Rules

詳細は `.claude/rules/` を読む。本ファイルには作業中に見失いやすい規約だけ載せる。

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

## Documentation and writing

ユーザー向けの Docs / Blog / Release notes を書く・編集する前に、次の 3 ファイルを読む:

- `docs/ai/writing-style.md` — 文体（B1 相当の読みやすさ）
- `docs/ai/docs-policy.md` — Docs / Blog / Release notes の役割分担
- `docs/ai/review-checklist.md` — 生成直後・PR レビュー時の最終チェック

アプリ内 UI 文言を書く時は `docs/ai/copywriting.md` を読む。

公開コンテンツの運用フロー（いつ何を書くか）は `docs/marketing/content-operations.md` を正本とする。

## Docs 運用責務

`docs/README.md` の地図・決定木・書き方の約束に従う。とくに以下は都度・自発的に実施する:

- **フィードバックの記録** — ユーザーの声（感想・要望・不具合報告）が届いたら、その日のうちに `docs/product/log/YYYY-MM-DD-feedback-<slug>.md` に原文のまま記録する（`/note` コマンド参照）
- **障害の記録** — 障害・トラブルが起きたら `docs/operations/log/YYYY-MM-DD-incident-<slug>.md` に記録する。対応手順そのものの更新は `docs/operations/` 側に別途反映する
- **機能仕様の反映** — プロダクトの振る舞いを変えたら `docs/product/specs/` の該当ファイルを更新する
- **月次ガーデニング** — 自動パートは毎月 1 日に Routine が実施し、journal 下書きの draft PR を作る（正本は `.claude/commands/gardening.md`）。当月 5 日を過ぎても `YYYY-MM-01-journal.md` の draft PR も merge 済み journal も無い状態でセッションが始まったら、Routine の故障を疑ってユーザーに報告し、`/gardening`（人間パート + 自動パートの手動代行）を提案する

## コマンド一覧（.claude/commands/）

`Skill` tool から起動する。

| コマンド       | 内容                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `/decision`    | 各ドメインの `log/` に `YYYY-MM-DD-slug.md` で意思決定ログを新規作成                                   |
| `/plan-review` | 直前の実装 plan を plan-fact-checker / plan-critic の 2 agent で並列レビュー                           |
| `/note`        | 各ドメインの `log/YYYY-MM-DD-slug.md` を新規作成（feedback-/incident- prefix対応）                     |
| `/gardening`   | 月次ガーデニングの人間パート（Routine の成果物レビューと価値判断。自動パートの手順も同ファイルが正本） |

## Rule Map

| ファイル                                | 使う場面                                               |
| --------------------------------------- | ------------------------------------------------------ |
| `.claude/rules/ai-behavior.md`          | subagent 委任、writer 境界、報告フォーマット、曖昧指示 |
| `.claude/rules/workflow.md`             | 作業規模、設計書、PR 粒度、git / merge 運用            |
| `.claude/rules/plan-format.md`          | 実装 plan を提示する時                                 |
| `.claude/rules/architecture.md`         | tRPC、状態管理、ロジック配置                           |
| `.claude/rules/code-style.md`           | 型、ログ、依存追加、eslint-disable                     |
| `.claude/rules/design-system.md`        | UI、token、spacing、icon                               |
| `docs/ai/copywriting.md`                | UI 文言、トーン、CTA                                   |
| `.claude/rules/feature-boundaries.md`   | feature DAG、Composition Layer                         |
| `.claude/rules/quality.md`              | test、a11y、performance                                |
| `.claude/rules/temporal-constraints.md` | 過去ブロック編集制約                                   |
| `.claude/rules/mcp-usage.md`            | Sentry / Supabase / Context7 / Vercel / Eagle          |
| `.claude/rules/skill-design.md`         | project skill の設計・更新                             |

## Skills

Project skills は `.claude/skills/` に置く。該当する作業では `SKILL.md` を先に読む。

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update / audit-ai-config / dispatch / blog-ideas / docs-audit

## Deploy / Release

- Staging branch と Production を同時に触らない
- Staging branch -> 開発者確認 -> 指示後に Production
- Supabase Edge Functions は `supabase functions deploy --use-api`
- release 意図が明示された時だけ `.claude/skills/releasing/SKILL.md` を使う
