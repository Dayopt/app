# Codex Rules Overlay

Dayopt の詳細ルールは `.claude/rules/` を canonical source とする。`.codex/rules/` は Codex が迷いやすい運用差分だけを薄く置く場所。

## Policy

- 既存ルールを複製しない。共通ルールは `.claude/rules/` を参照する
- Codex 固有の差分は短く、実行可能な形で書く
- ルールを増やす時は、先に `.claude/rules/` に置くべき内容ではないか確認する
- hooks / MCP / local app state に関する Codex だけの情報は `.codex/rules/` に置いてよい

## Files

- `git-workflow.md` — Codex での branch / commit / PR / merge 運用

## Canonical References

- `AGENTS.md` — Codex の入口
- `.claude/rules/workflow.md` — Dayopt 共通の作業・git 運用
- `.claude/rules/plan-format.md` — plan 出力形式
- `.agents/skills/` — 作業種別ごとの project skill
