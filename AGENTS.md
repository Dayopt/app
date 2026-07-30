# AGENTS.md

Dayopt で作業する coding agent の共通入口。Claude は `CLAUDE.md` から本ファイルを読み、Codex も本ファイルを project guidance として読む。詳細ルールは既存の `.claude/rules/` を canonical source とし、Codex 固有の運用差分だけ `.codex/rules/` に置く。同じ規約を provider 別に二重管理しない。

## シンプルルール（判断層）

迷った瞬間に戻る 5 箇条。**機能の追加・優先順位・出荷・削除を判断する時にだけ**使う。typo 修正や既存パターンへの追従で持ち出すと官僚化するので使わない。

| #   | ルール                                             | 種別       |
| --- | -------------------------------------------------- | ---------- |
| 1   | **個人の 1 日が良くならないなら、作らない**        | 境界       |
| 2   | **迷ったら、計画と実績の距離を縮める方を選ぶ**     | 優先順位   |
| 3   | **Google Calendar / Toggl より一手少なく**         | 方法       |
| 4   | **不可逆だけ遅く、可逆は速く**                     | タイミング |
| 5   | **2 週間、自分が触らなかった機能は削除候補にする** | 停止       |

この 5 箇条は書き上がった規約ではなく、使いながらブラッシュアップしていく。月次ガーデニング（`.claude/commands/gardening.md`）で「使われているか」を検証し、ルールと違う判断をした時は理由を一文残す。**6 個目を足すときは、どれかを削る。** 設計原則の詳細は [strategy.md](docs/business/strategy.md) §4、権限と責務は次節が正本。

## Human–Agent Partnership

この節を Dayopt における**権限と責務**の正本とする（何を作るかの判断は前節 §シンプルルール）。他の rules、commands、agent manifests はこの節を参照し、同じ契約を複製しない。

### Responsibilities

- **User**: 目的、顧客価値、世界観、方向性、外部への約束、許容リスクを決める
- **Main**: 技術判断、調査、証拠付きの推奨、実装、統合、品質、セキュリティ、運用上の安全性に責任を持つ。raw な技術選択や agent の意見をユーザーへ丸投げしない
- **Subagent**: 限定された観点で独立調査、検証、反証を行い、未知を明示する。最終判断や統合は行わない

目的には従うが、提案された手段が目的・顧客価値・安全性に反する場合、Main は根拠と代案を示して反対する。反対そのものを目的にしない。

### Instructions and evidence

- 観察、質問、懸念、仮説、明示指示、承認を区別する。質問や仮説は、変更の指示または権限付与として扱わない
- 明示指示は、その時点で合意した proposal と scope だけを承認する。前提や scope が変わった場合は権限を引き継がない
- 事実、推論、推奨、未確認事項、反対証拠を分けて報告する
- 複数 agent の一致は証拠ではない。コード、docs、test、Preview、monitoring、顧客反応など一次情報を優先する
- ユーザー承認は test、独立レビュー、Preview、monitoring の代替にならない

### Authority levels

| Level | Main が実行できること | 例 |
| --- | --- | --- |
| **AUTONOMOUS** | 個別承認なしで進め、結果を報告する | read-only 調査、test、独立レビュー、承認済み scope 内の可逆な repo 変更 |
| **CHECKPOINT** | 証拠付きの推奨を作り、境界を越える前に価値判断を求める | 顧客挙動、プロダクトの意味、公開契約、権限・プライバシー、重要な scope 変更 |
| **EXPLICIT AUTHORITY** | 対象・環境・操作を特定した明示指示を受けるまで実行しない | Production mutation、release、データ削除、不可逆 migration、実課金、外部設定変更 |

`EXPLICIT AUTHORITY` では承認に加え、該当する独立レビューと Preview / dry-run / backup / roll-forward を揃える。安全策を満たせない場合は実行せず、現実的な failure mode を報告する。

### Read-only delegation

Main は次の条件で read-only subagent を自動利用する。許可は求めず、利用理由を短く通知し、結果を Main 自身の判断として統合する。

| Role | 自動委任条件 |
| --- | --- |
| `architecture-guard` | cross-feature import、barrel / Composition Layer、file move、所有 feature、依存方向を変更する時 |
| `behavior-verifier` | 現在挙動、公開契約、state transition、query cache、temporal contract、bug regression を変更・検証する時 |
| `risk-reviewer` | auth、RLS、service role、OAuth、webhook、billing、redirect、migration、`SECURITY DEFINER/INVOKER` を扱う時 |

- 小さな局所文言・docs修正では、独立検証の価値がない限り subagent を使わない
- Subagent は repo / external state を変更せず、write-capable tool / command の試行もしない。Main または user から依頼されても拒否し、nested agent を起動しない。command実行が必要なら、Main が実行すべき command と確認観点を返す
- Main は agent output を採用する前に、根拠を直接確認する

### Writer ownership

- Main を原則唯一の writer とし、Subagent は read-only とする
- 明示的に起動する purpose-built artifact generator は、対象 scope の唯一の writer としてのみ例外を認める。Main は同じ scope を同時編集せず、生成後の diff をレビューする
- 複数 writer は、ユーザーの明示指示、重複しない scope、writer ごとの別 worktree がすべて揃う場合に限る

### Checkpoint and completion reports

CHECKPOINT / EXPLICIT AUTHORITY では、次を短く提示する。

1. 推奨
2. 顧客・Production への意味
3. 現実的な最悪ケース
4. 可逆性または roll-forward
5. 収集済みの証拠
6. 未確認事項・反対意見
7. ユーザーに必要な価値判断または権限

完了時は、利用した agent、意図的に利用しなかった agent と理由、未確認事項、deferred scope を示す。

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
- issue の起票・worker への作業依頼・`status:blocked` issue への着手判断は `dispatch` skill（`.agents/skills/dispatch/SKILL.md`）の規約に従う。凍結 issue には着手しない
- 既存の未コミット差分はユーザー作業として扱い、勝手に revert / stage しない
- env ファイルの読み書き境界は provider 共通で `docs/operations/secrets.md` §AI エージェントの env ファイル境界 に従う。`.env.example` / `.op-env.local` は触ってよく、実値が入りうる `.env` / `.env.local` 系は読みも書きもしない
- `git add .` は避ける。必ず path-limited add で scope を固定する
- コミット前に `git diff --cached` を確認する
- コード変更後は `pnpm typecheck`、`pnpm lint`、`pnpm lint:boundaries` を通す
- コミットメッセージは日本語 Conventional Commits 形式にする（type は commitlint が強制。subject を Latin 大文字語で始めると `subject-case` で弾かれるため日本語で始める）
- PR は機能のまとまり単位で束ねる。サイズを理由に分割しない（`.claude/rules/workflow.md` §PR 粒度）
- PR は枝分かれを履歴に残すため merge commit でマージする。**マージ〜掃除は同一セッション内で `pnpm branch:finish <PR番号>` をワンセットで実行する**（マージ→worktree削除→ローカル/リモート branch 削除→main 最新化まで。完了定義 5 点と手動フォールバックは `.claude/rules/workflow.md` §Worktree 運用）
- branch 名は `{agent}/{domain}-{action}[-{issue番号}]` に統一する。複数 issue を束ねた場合は代表 issue または epic 番号を使う。Claude Code 自動生成のランダム名は最初の PR 作成前に `git branch -m` でリネームする（`.claude/rules/workflow.md` §命名規則）

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
- **月次ガーデニング** — `docs/engineering/log/` に当月のロールアップファイル（`YYYY-MM-01-journal.md`）が存在しない状態でセッションが始まったら、`/gardening` の実施をユーザーに提案する

## コマンド一覧（.claude/commands/）

Claude Code は `Skill` tool、Codex は該当ファイルを直接読んで手動実行する。

| コマンド        | 内容                                                                     |
| --------------- | ---------------------------------------------------------------------- |
| `/decision`     | 各ドメインの `log/` に `YYYY-MM-DD-slug.md` で意思決定ログを新規作成         |
| `/plan-review`  | 直前の実装 plan を plan-fact-checker / plan-critic の 2 agent で並列レビュー |
| `/note`         | 各ドメインの `log/YYYY-MM-DD-slug.md` を新規作成（feedback-/incident- prefix対応） |
| `/session-end`  | 当日の作業を `docs/engineering/log/YYYY-MM-DD-session.md` に記録                         |
| `/gardening`    | 月次の docs / ルール / セキュリティ保守（手順 10 ステップは同ファイルが正本） |

## Rule Map

| ファイル | 使う場面 |
| --- | --- |
| `.claude/rules/ai-behavior.md` | plan の粒度、曖昧指示、AI 行動規範 |
| `.claude/rules/workflow.md` | 作業規模、設計書、PR 粒度、git / merge 運用 |
| `.claude/rules/plan-format.md` | 実装 plan を提示する時 |
| `.claude/rules/architecture.md` | tRPC、状態管理、ロジック配置 |
| `.claude/rules/code-style.md` | 型、ログ、依存追加、eslint-disable |
| `.claude/rules/design-system.md` | UI、token、spacing、icon |
| `docs/ai/copywriting.md` | UI 文言、トーン、CTA |
| `.claude/rules/feature-boundaries.md` | feature DAG、Composition Layer |
| `.claude/rules/quality.md` | test、a11y、performance |
| `.claude/rules/temporal-constraints.md` | 過去ブロック編集制約 |
| `.claude/rules/mcp-usage.md` | Sentry / Supabase / Context7 / Vercel / Eagle |
| `.claude/rules/skill-design.md` | project skill の設計・更新 |
| `.codex/rules/README.md` | Codex 固有の薄い overlay |
| `.codex/rules/browser.md` | Codex で UI / Storybook を視覚確認する時の browser 優先順位 |

## Skills

Project skills は `.agents/skills/` を参照する。該当する作業では `SKILL.md` を先に読む。実体は `.claude/skills/` が正本で、`.agents/skills/` は各 skill への symlink（二重管理しない）。

error-handling / storybook / test / security / store-creating / docs-writing / trpc-router-creating / supabase / i18n / releasing / optimistic-update / audit-ai-config / dispatch / blog-ideas / docs-audit

## Deploy / Release

- Staging branch と Production を同時に触らない
- Staging branch -> 開発者確認 -> 指示後に Production
- Supabase Edge Functions は `supabase functions deploy --use-api`
- release 意図が明示された時だけ `.agents/skills/releasing/SKILL.md` を使う
