---
status: frozen
date: 2026-07-24
---

# Worktree / branch 運用を統一する（命名規則 + ワンセット掃除スクリプト）

## 背景・当時の前提

- 複数 AI（Claude / Codex / 将来の他ツール）に並行セッションを依頼する前提で、worktree と branch の運用がバラバラになり、ユーザーが「worktree と branch が同じ概念なのか」から混乱していた
- 命名が不揃い: Claude Code の自動 worktree は `claude/worktree-branch-strategy-9383e9` のようなランダム suffix、Codex は `codex/{自由記述}`。名前から作業内容が読めない
- マージ後の掃除が手順の羅列で、`.claude/rules/workflow.md` §Worktree 運用に手順はあったが「リモート確認 → main 復帰 & pull」までを含む**完了定義**がなく、実行漏れで「リモートだけ残る」「ローカルだけ残る」が発生していた
- 2026-07-24 時点の実態調査:
  - リモートは `origin/main` のみでクリーン（`deleteBranchOnMerge: true` が効いている）
  - ローカルの残骸は 2 件 — `claude/issue-1705`（未マージ作業あり・進行中扱い）と `codex/mcp-plan-track-learn`（main から 73 コミット遅れ・PR なし・未マージコミットあり）

## 決定と理由

**branch 命名を `{agent}/{domain}-{action}[-{issue番号}]` に統一し、マージ〜掃除を共通スクリプト `pnpm branch:finish <PR番号>` にワンセット化する。**

- **命名統一**: Project 命名規則（domain-action）と同型にそろえ、provider をまたいで一貫させる。Claude Code の自動ランダム名は最初の PR 作成前に `git branch -m` でリネームする運用にする（worktree ディレクトリ名は使い捨てなので branch 名だけ直せば PR に正しい名前が乗る）
- **共通スクリプト化**: 掃除が手順の羅列だと実行漏れが起きる。1 コマンドに畳み、完了定義 5 点（① PR マージ済み ② worktree 削除 ③ ローカル branch 削除 ④ リモート branch 消滅 ⑤ main 最新化）を満たすまでを機械的に保証する。Claude / Codex / 人間が同じコマンドを使うことで運用を統一する
- **概念整理を rules に明記**: branch（履歴ポインタ）と worktree（作業ディレクトリ）は別物で、「worktree を消しても branch は残る」ことを明文化。3 点（worktree・ローカル branch・リモート branch）を揃えて消す必要があることを掃除の根拠として書いた

## 却下した選択肢と、なぜ捨てたか

- **スクリプトを作らず rules のチェックリスト強化だけ**: 手順は既にあったのに実行漏れが起きていた。人間の注意力に頼る形は同じ失敗を繰り返す。機械化して初めて完了定義が保証される
- **issue 番号ベースの命名に一本化**: すべての作業に issue 起票を強制することになり、小さな docs 修正などで overhead。issue 番号は「あれば末尾に付ける」任意要素にとどめた

## 影響・やること

- 追加: `scripts/git/finish-branch.sh`、`package.json` に `branch:finish` script
- 改訂: `.claude/rules/workflow.md`（概念整理・命名規則・完了定義・スクリプト標準化）、`.codex/rules/git-workflow.md`、`AGENTS.md` Non-Negotiables
- スクリプトは `--dry-run` 対応。dirty / not fully merged では停止してユーザー判断に委ねる（`-D` 強制はしない）

## 保留（ユーザー判断待ち）

- `codex/mcp-plan-track-learn` branch と `~/.codex/worktrees/16e2/dayopt`（main から大きく遅れ・PR なし・未マージコミットあり）は今回触らない。救出（rebase / PR 化）か破棄かはユーザーが別途判断する
- `claude/issue-1705` worktree は進行中作業のため対象外
