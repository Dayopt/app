---
status: frozen
date: 2026-08-05
---

# Codex をクラウドレビュー専任に縮退し、AI 設定を Claude 一本へ再編する

## 背景・当時の前提

- これまで Codex は (a) `chatgpt-codex-connector[bot]` によるクラウド PR レビューと (b) ローカル CLI worker（`~/.codex/worktrees/` での実装・commit・merge）の両輪で運用していた
- その前提で repo には provider 共通の入口 `AGENTS.md`（CLAUDE.md は `@AGENTS.md` の 1 行）、Codex 差分の `.codex/`（agents 5 / hooks 8 / rules 4 / config）、provider 中立の `.agents/`（roles 正本 5 + skills symlink 15）が存在した
- 2026-08-03 に Gemini ベースの ai-review を撤去し、外部レビューを Codex に一本化済み。今回はさらに「実装も Claude に一本化し、Codex はレビューのみ」に運用を変更する
- 調査（2026-08-05）で確認した事実: `.codex/` 配下はすべてローカル CLI セッション前提で、クラウドレビューは repo の `.codex/` を読まない。Codex クラウドレビューが読むのは `AGENTS.md`（`## Code Review Rules` セクションをレビュー規則として適用）のみ（[公式](https://developers.openai.com/codex/guides/agents-md)）

## 決定と理由

**ローカル coding agent を Claude のみとし、Codex はクラウド PR レビュー（`@codex review`）専任にする。それに合わせて AI 設定を再編する。**

1. `CLAUDE.md` を実装・運用ガイダンスの正本にする（旧 AGENTS.md の全内容を移し、Codex 併記を除去）
2. `AGENTS.md` は Codex クラウドレビュー専用の薄いレビュー規則ファイル（`## Code Review Rules`）に縮小する。完全削除しなかったのは、レビューへのカスタム指示手段が AGENTS.md しかないため
3. `.codex/` を全削除する（クラウドレビュー専任化で実用価値ゼロ。hooks 4 本は `.claude/hooks/` と byte 一致の重複だった）
4. `.agents/` を全削除する。roles 正本 5 ファイルは `.claude/agents/*.md` へインライン化（thin pointer の間接層を廃止）、skills symlink は Codex 用の入口だったため撤去
5. 連動修正: `ci.yml` paths-ignore と `scripts/ci/impact.mjs`（同一規則のためセットで）、`dispatch` skill の Codex worker 経路、`workflow.md` / `mcp-usage.md` などの Codex 併記、docs の `.agents/` パス参照、`.gitignore` の矛盾した `AGENTS.md` 行

外部レビューとしての Codex 運用（draft のまま `@codex review`、指摘の必須解決、`branch:finish` の review thread ゲート）は変更しない。

## 却下した選択肢と、なぜ捨てたか

- **AGENTS.md の完全削除** — クラウドレビューへの唯一のカスタム指示手段を失う。レビュー精度を規則で調整できる余地を残す価値が上回る
- **`.agents/roles/` の維持（provider 中立層として温存）** — 読者が Claude しかいない層に間接参照を挟む理由がない。将来 provider を再追加する時に履歴から復元すれば足りる
- **`.codex/` の「無効化して様子見」** — audit-ai-config skill の方針（git 管理対象は削除し、必要なら履歴から復元）に反する

## 影響・やること

- Codex レビューの精度が落ちた場合は `AGENTS.md` の Code Review Rules を厚くして調整する（可逆）
- `dispatch` skill の worker は Sonnet 等の Claude 系モデルのみになる
- 全変更は git revert で復元可能。旧構成の設計意図は `docs/engineering/log/2026-07-07-ai-config-audit.md` と本ログから辿れる
