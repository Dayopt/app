# Codex Git Workflow

Codex が Dayopt repo で branch / commit / PR / merge を扱う時の薄い overlay。共通ルールは `.claude/rules/workflow.md` を canonical とする。

## Branch

- 新規作業は `codex/{short-description}` ブランチを切る
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
- issue 対応なら `Closes #NNNN` を本文に入れる

## Merge

- ユーザーが単に「マージして」と言った場合は `gh pr merge --merge --delete-branch` を使う
- 理由: main の履歴に branch の分岐と合流を残すため
- `--squash` / `--rebase` は GitHub 設定でハード無効化済み（`--admin` でも迂回不可）。release 運用も merge commit に統一されている。squash が必要な稀なケースは repo 設定変更が前提
- merge 前に PR が mergeable で、required checks が成功していることを確認する

## Branch cleanup（マージ後）

- マージ済み PR のブランチ削除は、通常順で実施する:
  - `git worktree remove <worktree-path>`（worktree が branch を持っている場合に先に解除）
  - `git branch -d <branch>`（merge 済みなら成功）
- `worktree remove` が失敗する場合は、worktree 内で `main` に checkout してから再度実施する
- `git branch -d` が `not fully merged` で失敗したときは `-D` は原則禁止。必要ならユーザー判断で別途確認
