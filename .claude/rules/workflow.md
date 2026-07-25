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

### 規模と PR の関係

**Step 分割は「作業と plan の単位」であって「merge の単位」ではない。** 大規模 project を 6 Step に割っても、PR は機能のまとまりで束ねる（§PR 粒度）。Step ごとに PR を切らない。

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
- `calendar-state-unification`

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

`overview.md` の `status` は進行中なら `active`、意図的に止めるなら `paused` とする。step文書は通常のstockとして `status: current` を使う。

または簡略形式として `docs/projects/{project-name}-detail.md` 1 ファイル。

### 完了後

Project 完了時も同じ `docs/projects/{project-name}/` に置いたまま `summary.md` を追加:

```

完了時は `overview.md` を `status: done` にし、`summary.md` を `status: current` で追加する。`done` と `summary.md` は常に同じ変更に含める。
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

UI 変更を含む作業では、関連 Story がある場合は Storybook を起動し、Main が視覚確認する。ユーザーと画面を共有できる provider では、同じ browser surface を優先する:

- 既存 stories の regression なし
- 新規 stories の描画確認
- browser の選択は provider 固有の overlay に従う。Codex は `.codex/rules/browser.md` を正本とする
- Tomoya の確認は最終的なプロダクト判断として追加できるが、Main 自身の検証の代替にはしない

## PR 粒度

策定日: 2026-07-25

**標準は「機能のまとまり単位で 1 PR」。サイズを理由に PR を分割しない。** epic 全体、関連する複数 issue、複数 Step を 1 branch・1 PR に束ねるのを既定とする。分割したい時に理由を示す。

### 分割してよい理由（これ以外では分割しない）

- 不可逆 migration を含む変更の隔離
- code removal と destructive migration の混在回避（[time-model-split step-9](../../docs/projects/time-model-split/step-9-cleanup.md) の教訓）
- 独立して検証・revert したい変更（production release 経路など、壊れた時の影響が他と切り離される変更）

「レビューしやすいから」「1 issue だから」「大きいから」は分割理由にならない。

### 束ねた PR のレビュー

複数 issue / 複数 Step を束ねた PR は、**merge 前に read-only subagent のクロスレビューを必須**とする。対象は `AGENTS.md` §Read-only delegation の自動委任条件に該当するもの（`architecture-guard` / `behavior-verifier` / `risk-reviewer`）。PR が大きい分、人間の目視レビューだけに依存しない。

### なぜ束ねるか

Actions 課金は **PR ごとの固定費が支配的**（2026-07-25 実測）:

- CI 1 run = 18 課金分（job ごと 1 分切り上げ）。PR 1 本 ≈ 44 課金分
- PR あたりの CI run は 1.75 回。`concurrency: cancel-in-progress` が効くため、コストは push 回数ではなく **PR 本数**にほぼ比例する
- §Worktree 運用 の up-to-date gate により、他 PR が main に入るたび追従 push と CI 再実行が要る。**並行 PR N 本で追加 CI が O(N²)** に効く

個人開発で内部レビューを前提にできる以上、PR を小さく保つ便益より、本数に比例するコストと運用オーバーヘッドの方が大きい。

### 先行事例

[PR #1657](https://github.com/Dayopt/dayopt/pull/1657) は #1534 / #1535 を 1 PR に束ねた。当時は「1 issue = 1 PR の意図的な例外」としてユーザーの明示指示を根拠にしていた。本節はこの例外を既定に反転させたもの。

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

これは**掃除の規律であって PR のサイズの話ではない**。1 PR に何 issue・何 Step を入れるかは §PR 粒度 が決める。

### 概念整理（branch と worktree の違い）

混同しやすいので明確にする。

- **branch** = コミット履歴を指すポインタ（ラベル）。ローカルとリモート（`origin/*`）に別々に存在する
- **worktree** = branch を実際に checkout して編集する作業ディレクトリ。1 つの repo に複数の worktree を並べ、それぞれ別 branch を同時に開ける（並行 AI セッションの土台）
- 両者は別物: **worktree を消しても branch は残る**。だから掃除では「worktree・ローカル branch・リモート branch」の 3 つを揃えて消す必要がある。「リモートだけ残る」「ローカルだけ残る」はこの 3 点の消し忘れが原因

### 命名規則

branch 名は **`{agent}/{domain}-{action}[-{issue番号}]`** で統一する（provider 共通）。

- **agent**: `claude` / `codex` など、作った AI / 人を表す接頭辞
- **domain-action**: Project 命名規則（本ファイル §Project 命名規則）と同型の kebab-case。例: `calendar-sync-fix`, `i18n-audit`, `sidebar-routing-unification`
- **issue 番号**: 対応 issue があれば末尾に付ける。例: `codex/external-calendar-sync-1705`。複数 issue を束ねた PR（§PR 粒度）では代表 issue または epic 番号を使う。例: `claude/external-calendar-1702`
- 良い例: `claude/calendar-sync-fix` / `codex/i18n-audit-1705`。悪い例: `claude/worktree-branch-strategy-9383e9`（内容が読めないランダム suffix）, `fix-stuff`（domain 不明）
- **Claude Code が自動生成するランダム suffix 名は、最初の PR を作る前に `git branch -m {agent}/{domain}-{action}` でリネームする**。worktree のディレクトリ名は使い捨てなのでリネーム不要（branch 名だけ直せば PR に正しい名前が乗る）

### 置き場と作成

- Claude Code は `.claude/worktrees/<name>/` に自動作成する（gitignore 済み）。Codex は `~/.codex/worktrees/` を使う。**手動で `git worktree add` する場合も `.claude/worktrees/` 配下に置く**（repo 直下や無関係な場所に散らさない）
- 他ツールの worktree（`~/.codex/` 配下）は各ツールの管理に任せ、手動で触らない
- `.op-env.local` は gitignore 済みのため worktree には引き継がれないが、`pnpm dev` 実行時に main checkout から自動コピーされる（`scripts/dev-with-op.sh`）。手動セットアップは不要

### マージ後の掃除（AI の責務、merge と同一セッションで実施）

**標準は `pnpm branch:finish <PR番号>` のワンセット実行。** マージ〜掃除〜main 最新化までを 1 コマンドで行う（`scripts/git/finish-branch.sh`。Claude / Codex / 人間で共通）。

```bash
pnpm branch:finish <PR番号>            # マージ→worktree削除→branch削除→リモート確認→main最新化
pnpm branch:finish <PR番号> --dry-run  # 実行せず予定アクションだけ確認
```

スクリプトが内部で行うこと（= 手動フォールバック時にたどる手順）:

1. PR 状態を取得。OPEN かつ失敗 check が無ければ `gh pr merge <N> --merge --delete-branch`（main が他 worktree で checkout 中で失敗する場合は `gh api` の直接マージにフォールバック）
2. 該当 branch の worktree を特定し、`status --porcelain` が空であることを確認（**dirty なら停止**してユーザーに委ねる）
3. `git worktree remove --force <path>` で worktree を解除
4. `git fetch --prune` → main を checkout して `git pull --ff-only origin main`（**branch 削除より先に main を最新化する**）
5. `git -C <main> branch -d <branch>`（**`-d` のみ。not fully merged なら停止**）
6. リモートに `origin/<branch>` が残っていれば `git push origin --delete <branch>` → `git worktree prune`

順序に意味がある: ① **worktree が参照する branch を先に解除しないと branch 削除が不可能**なため `worktree remove` を先に行う。② **`branch -d` の前に main を pull する**（`gh pr merge` はリモートしか更新しないので、pull 前だと branch 先端がローカル main から辿れず、追跡設定の無い branch は誤って not fully merged 扱いになる）。スクリプトが途中で停止した場合（dirty / not fully merged）は、下記「削除時の安全確認」に従って手動で判断する。

### 完了定義（ワンセット）

以下 5 点すべてを満たして初めて「作業終了」とする。1 つでも欠けたら未完了（「リモートだけ残る」等はこの積み残し）。

1. PR がマージ済み
2. worktree が削除済み
3. ローカル branch が削除済み
4. リモート branch が消滅（`git fetch --prune` 後に `origin/<branch>` が無い）
5. main checkout が最新（`git pull --ff-only` 済み）

`pnpm branch:finish` はこの 5 点を満たすと完了サマリーを出す。手動で進めた場合も同じ 5 点を自分で確認する。

### 削除時の安全確認

- 削除前に `git -C <worktree-path> status --porcelain` が空であることを確認する。未コミット差分が残る worktree はユーザー作業として扱うため、消去前に確認を取る
- **`rm -rf` で worktree を直接消さない**。git の管理情報が残って孤児化する。必ず `git worktree remove` を使う
- gitignore された生成物（`.next/` 等）だけが残って `remove` が拒否される場合は、tracked ファイル差分がないことを確認した上で `git worktree remove --force`
- `git branch -d <branch>` が `not fully merged` で失敗したら、原則 `-D` は使わずユーザー確認を取る（保留/close の再確認、必要なら別 PR 化）

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
