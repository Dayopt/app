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

- PR は draft で作成する。ただしユーザーが ready 指定した場合は ready にする
- PR body には変更点、理由、検証を入れる
- issue 対応なら `Closes #NNNN` を本文に入れる

## Merge

- ユーザーが単に「マージして」と言った場合は `gh pr merge --merge --delete-branch` を使う
- 理由: main の履歴に branch の分岐と合流を残すため
- `--squash` はユーザーが明示した時、または release 運用など既存手順が明示している時だけ使う
- merge 前に PR が mergeable で、required checks が成功していることを確認する
