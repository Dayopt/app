---
name: audit-ai-config
description: 棚卸し、設定の整理、audit、AI設定レビューの明示依頼時に発動。.claude/skills・.agents/skills・rules・commands・Codex overlay・MCP・AGENTS.md の重複、配置、発火条件を評価する。docs 棚卸しや skill 新設判断では発動しない。
effort: medium
maxTurns: 15
---

# AI設定の棚卸し(audit-ai-config)

Dayopt の AI 協働設定を棚卸しし、不要・重複・配置間違い・発火条件の曖昧さを検出する。削除や移動は提案としてまとめ、ユーザー承認後に実行する。

## When to Use

**明示発動型** — この skill はユーザーの explicit な AI 設定棚卸し意図のみを契機に発動する。

- 「AI設定を棚卸しして」「設定を整理して」など、AI 協働設定全体の audit が明示された時
- `.claude/`、`.codex/`、`.agents/skills/`、`.mcp.json` の重複や配置を点検するよう指示された時
- skill / rules / commands / agents / hooks の使い分けをレビューするよう指示された時
- AI 設定の削除候補・統合候補・発火条件改善案をまとめるよう指示された時

## When NOT to Use

この skill は **explicit AI 設定棚卸し意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- docs の棚卸し・鮮度確認 → `/gardening`
- docs gap の検出・技術ドキュメント更新 → `docs-writing` skill
- skill 新設・description 書式判断 → `.claude/rules/skill-design.md`

## Inventory

以下を列挙し、件数・責務・最終更新・重複候補を確認する。

- `.claude/skills/*/SKILL.md` と `.agents/skills/*/SKILL.md`
- `.claude/rules/*.md` と `.codex/rules/*.md`
- `.claude/commands/*.md`
- `.claude/agents/*.md` と `.codex/agents/*.toml`
- `.claude/hooks/*`、`.codex/hooks/*`、`.codex/hooks.json`
- `.claude/settings.json`、`.codex/config.toml`
- `.mcp.json`
- `AGENTS.md`

## Review Questions

各項目を 4 つの質問で評価する。

1. **使用実績**: 直近の git log、docs、AGENTS、commands から使われた形跡があるか。3か月以上使われた形跡がないものは削除候補にする。
2. **適材適所**: もっと下位の仕組みで代替できないか。判断不要・毎回実行するものは hooks か package.json script へ、短い常時ルールは AGENTS.md / rules へ、単発 CLI で済む外部連携は MCP ではなく CLI 運用へ寄せる。
3. **重複**: AGENTS.md、rules、skills、docs、Codex overlay で同じ規約を二重管理していないか。正本を 1 箇所に決め、他は参照に落とす。
4. **トリガー品質**: skill の description / When to Use は発火条件として具体的か。対象ファイル、作業種別、NOT 条件が曖昧なものは書き直し案を出す。

## Output

以下の 3 分類で短く提案する。

- 削除提案: 対象、理由、復元方法
- 移動・統合提案: 移動元、移動先、正本にする理由
- 改善提案: description / When to Use / NOT 条件の修正文案

実行まで指示された場合は path-limited add を使い、コミットメッセージは `chore: AI設定の棚卸し(YYYY-MM)` とする。

## Safety

- `~/.claude.json`、`~/.claude/settings.json`、`~/.claude/plugins/` など個人側の認証・インストール状態は削除対象にしない。
- repo 内の `.claude/settings.local.json` のような local state は、削除提案前に git 管理対象かを確認する。
- 「無効化して様子見」を基本方針にしない。git 管理対象で不要と判断できるものは削除候補にし、必要なら履歴から復元する。
