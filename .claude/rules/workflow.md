# ワークフロー規約

策定日: 2026-04-23

Dayopt の作業を進める際の規約。作業規模に応じて進め方を使い分ける。

## 作業規模の判定

以下のいずれか 1 つでも該当 → **大規模**（保守的判定）:

- 想定コミット数 6 以上
- 想定 Step 数 5 以上
- 想定作業時間 1 日以上
- blast radius が shell / layout / routing 横断
- 未知の発見リスクが高い（設計途中で方針変更ありうる）
- 新 feature の新設

いずれかに該当 → **中規模**:

- 想定コミット数 3-5
- 想定 Step 数 2-4
- 想定作業時間 半日程度
- 1 feature 内に閉じる

上記以外 → **小規模**:

- 想定コミット数 1-2
- 想定 Step 数 1
- 想定作業時間 1 時間以下
- 1 ファイル / 1 module に閉じる

## 規模別の進め方

### 大規模

- Project 全体設計書を必ず作成（`docs/projects/{project-name}/overview.md`）
- 複雑な Step は Step 詳細設計書（`step-X-detail.md`）
- 各 Step で事前調査プロンプト必須
- 相談事項は Option α/β/γ 形式で提示
- path-limited add / git diff --cached を必須ゲートに

### 中規模

- Project 全体設計書は推奨（省略する場合は理由を明示）
- Step 詳細設計書は省略可
- 事前調査プロンプトは推奨
- 相談事項は Option 形式
- path-limited add は採用

### 小規模

- 設計書作成不要
- 事前調査プロンプト省略可
- 直接実装プロンプトで OK
- blast radius を事前確認のみ

### 迷った時

規模を大きめに判定して手法をフル採用。overhead より手戻り回避を優先。

## Project 命名規則

形式: `{domain}-{action}[-{variant}]`

原則:

- **domain**: 主要な影響範囲（sidebar / tag / auth / calendar / stats / ai 等）
- **action**: 動詞ベース（redesign / migration / refactor / unification / cleanup 等）
- **variant**: 必要なら区別（design / implementation / cleanup 等）
- kebab-case で統一
- Phase N-X のような記号的命名は使わない
- 連続 project は domain 接頭辞で関係性を表現

### 実例

**良い例**:

- `sidebar-routing-unification`（旧 Phase 2-B）
- `sidebar-3-mode-structure`（旧 Phase 2-C）
- `sidebar-v2-design`（旧 Phase 2-D）
- `feature-colocation-migration`（旧 Phase 2-E）
- `tag-management-refactor`
- `watching-ai-implementation`

**悪い例**:

- `phase-2-c`（記号的、内容不明）
- `sidebar-work`（action が曖昧）
- `fix-stuff`（domain 不明）

## 設計書の保存場所

散文の設計書は repo 直下 `docs/projects/` に置く（Storybook には載せない。ビルド不要で GitHub 上でそのまま読める。`<Meta>` ラッパー不要の素の Markdown）。

### 進行中

```
docs/projects/{project-name}/
├── overview.md        — Project 全体設計書
└── step-X-detail.md   — Step 詳細設計書（必要なら）
```

または簡略形式として `docs/projects/{project-name}-detail.md` 1 ファイル。

### 完了後

Project 完了時も同じ `docs/projects/{project-name}/` に置いたまま `summary.md` を追加:

```
docs/projects/{project-name}/
├── overview.md
├── step-X-detail.md
└── summary.md         — 完了時に追加（達成した成果）
```

移動時の作業:

- git mv で履歴追跡
- 内部リンクの path 修正
- `summary.md` を新規追加（Project 完了サマリー）

### src/ にはコロケーションしない

設計書は Project 単位（複数ファイル横断）の情報なので、src/ の個別コードにコロケーションしない。src/ はコード専用、設計書は `docs/projects/` に集約する。

ただし feature 単位の長期設計（ARCHITECTURE.md 相当）は feature 内コロケーションの選択肢あり。これは Project 設計書とは別物。

## 共通ゲート（規模によらず）

### path-limited add

関係ない dirty ファイル（他タスクの中間状態等）を誤って staged しないよう、明示的に add する:

```bash
git add path/to/file1
git add path/to/file2
```

`git add .` は避ける。

### git diff --cached

commit 前に必ず `git diff --cached` で index 内容を確認する。Edit ツールで変更した内容が working tree のみに反映されて index に入っていないケースを防ぐ（Step C-1 事故の教訓）。

### typecheck / lint / build

中規模以上の作業では以下を必ず pass:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm lint:boundaries`
- `pnpm build`（routing / layout 変更時）

### Storybook 視覚確認

UI 変更を含む作業では、Storybook 起動して視覚確認を Tomoya 側で実施:

- 既存 stories の regression なし
- 新規 stories の描画確認

## マージ方式

策定日: 2026-06-17

PR は **merge commit** でマージする。GitHub リポジトリ設定で squash / rebase merge を禁止済み（`mergeCommitAllowed: true` のみ）。

### なぜ merge commit か

- ブランチの分岐・合流を main の DAG に記録し、`git log --graph` や tig / lazygit で開発の経緯を可視化できるようにするため
- squash は「PR の全コミットを 1 個に潰して親 1 つで main に載せる」ため分岐情報が一切残らず、履歴が一直線になる。後からどのブランチがいつ合流したかを復元できない

### マージ手順

```bash
gh pr merge <PR番号> --merge --delete-branch
```

`--squash` / `--rebase` は使わない。GitHub 設定でハード無効化済みで、`--admin` でも merge method 制限は迂回できない。**release 手順も merge commit に統一**（[releases/process.mdx](../../apps/storybook/docs/operations/releases/process.mdx)）。squash が必要になる稀なケースでは repo 設定の変更が前提になる。

### 運用上の含意

- merge commit では**ブランチ上の各コミットがそのまま main に残る**。WIP / typo コミットを main に持ち込まないよう、1 コミット単位で意味の通る粒度・Conventional Commits 形式を守る
- revert は対象を見極める。マージコミット自体を戻す場合は `git revert -m 1 <merge-sha>`、個別コミットを戻す場合は通常の `git revert <sha>`
- マージ済みブランチは GitHub が自動削除（`deleteBranchOnMerge: true`）。ローカルでは `git branch -d` がマージを検出して安全に削除できる（squash 時代の `-D` 強制は不要になる）

## Worktree 運用

策定日: 2026-07-10

**原則: 1 worktree = 1 branch = 1 PR。役目（PR の merge / close）を終えた worktree はその場で削除する。** 放置すると worktree・ブランチ・孤児ディレクトリが積み上がり、どれが生きている作業か判別できなくなる。

### 置き場と作成

- Claude Code は `.claude/worktrees/<name>/` に自動作成する（gitignore 済み）。Codex は `~/.codex/worktrees/` を使う。**手動で `git worktree add` する場合も `.claude/worktrees/` 配下に置く**（repo 直下や無関係な場所に散らさない）
- 他ツールの worktree（`~/.codex/` 配下）は各ツールの管理に任せ、手動で触らない

### マージ後の掃除（AI の責務、merge と同一セッションで実施）

```bash
gh pr merge <N> --merge --delete-branch  # remote は deleteBranchOnMerge でも自動削除
git worktree remove <worktree-path>      # branch が worktree に checkout されている場合は先に
git branch -d <branch>                   # merge 済みなら -d が通る（-D は使わない）
```

順序に意味がある: **worktree に checkout されたブランチは削除できない**ため、`git worktree remove` が先。

### 削除時の安全確認

- 削除前に `git -C <worktree-path> status --porcelain` が空であることを確認する。未コミット差分が残る worktree はユーザー作業として扱い、勝手に消さない（確認を取る）
- **`rm -rf` で worktree を直接消さない**。git の管理情報が残って孤児化する。必ず `git worktree remove` を使う
- gitignore された生成物（`.next/` 等）だけが残って `remove` が拒否される場合は、tracked ファイルに差分がないことを確認した上で `git worktree remove --force`

### 定期掃除（月次 sweep で実施）

```bash
git worktree list          # 全 worktree と branch の対応を俯瞰
git worktree prune         # 手動削除などで孤児化した管理情報を掃除
git branch --merged main   # merge 済みローカルブランチ → git branch -d で削除
```

`git worktree list` に出ないのに `.claude/worktrees/` 配下に残っているディレクトリは孤児（過去の削除で gitignore 生成物だけが残った残骸）。中身が生成物のみであることを確認して削除する。

## 実例の参照先

各規模の実例:

**大規模**:

- `sidebar-routing-unification`（8 コミット / Phase 全体設計書 + Step 4 詳細）
- `sidebar-3-mode-structure`（7 コミット / Phase 全体設計書 + 各 Step 詳細）

**中規模**:

- （未実施、将来 `feature-colocation-migration` が該当予定）

**小規模**:

- フォローアップ作業群（typo 修正、namespace 追加、etc.）

詳細は `docs/projects/` 配下の各 project ディレクトリを参照。
