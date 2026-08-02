# Codex Git Workflow

Codex が Dayopt repo で branch / commit / PR / merge を扱う時の薄い overlay。共通ルールは `.claude/rules/workflow.md` を canonical とする。

## Branch

- 新規作業は **`codex/{domain}-{action}[-{issue番号}]`** ブランチを切る（命名規則は共通。`.claude/rules/workflow.md` §命名規則 が canonical）
  - 良い例: `codex/i18n-audit-1705` / `codex/calendar-sync-fix`
  - 複数 issue を束ねる場合は代表 issue または epic 番号を使う: `codex/external-calendar-1702`
  - 悪い例: 内容の読めないランダム名、`codex/work` のような action 不明の名前
- 既存 dirty file はユーザー作業として扱い、関係ない限り触らない
- `main` にいる時は作業前に branch を切る

## Stage / Commit

- `git add .` は使わない。path-limited add で対象を明示する
- commit 前に `git diff --cached` を読む
- コミットメッセージは日本語 Conventional Commits:
  - `feat(scope): 説明`
  - `fix(scope): 説明`
  - `docs(scope): 説明`
  - `chore(scope): 説明`
- unrelated dirty file が残っていても、scope 外なら stage しない

## Pull Request

- PR は最初から ready で作成する。
- draft での作成は、ユーザーが明示的に要求した場合のみ許可する
- PR body には変更点、理由、検証を入れる
- issue 対応なら `Closes #NNNN` を本文に入れる。**複数 issue を束ねた PR では 1 行ずつ全て列挙する**（`Closes #1534` / `Closes #1535`）
- PR の粒度は機能のまとまり単位で束ねるのが標準。サイズを理由に分割しない（`.claude/rules/workflow.md` §PR 粒度 が canonical）

## Merge

- ユーザーが単に「マージして」と言った場合は `pnpm branch:finish <PR番号>` を使う（マージ〜掃除がワンセット）
- 素の `gh pr merge --merge --delete-branch` は **worktree の中から実行しない**。削除対象 branch を checkout している worktree を main へ切り替えてしまう（[#1771](https://github.com/Dayopt/dayopt/issues/1771)）。Codex は `~/.codex/worktrees/` で作業するため常に該当する
- 理由: main の履歴に branch の分岐と合流を残すため
- `--squash` / `--rebase` は GitHub 設定でハード無効化済み（`--admin` でも迂回不可）。release 運用も merge commit に統一されている。squash が必要な稀なケースは repo 設定変更が前提
- merge 前に PR が mergeable で、required checks が成功していることを確認する

## Branch cleanup（マージ後）

- 標準は **`pnpm branch:finish <PR番号>`** のワンセット実行（マージ→worktree削除→main ref 更新→branch削除→リモート確認）。Claude / Codex / 人間で共通のスクリプト（`scripts/git/finish-branch.sh`）
- 事前確認したい時は `pnpm branch:finish <PR番号> --dry-run`
- スクリプトが dirty / main 未到達で停止したら、手動フォールバックは `.claude/rules/workflow.md` §Worktree 運用 の手順に従う。`git branch -d` が `not fully merged` で失敗したときは `-D` は原則禁止で、ユーザー判断を仰ぐ（例外は `git merge-base --is-ancestor <branch> refs/heads/main` で main への到達を確認済みの場合だけ）
- 完了定義（5点）: ① PR マージ済み ② worktree 削除 ③ ローカル branch 削除 ④ リモート branch 消滅 ⑤ ローカル `main` ref が `origin/main` と一致。すべて満たして初めて作業終了
