---
name: audit-ai-config
description: AI設定の棚卸し、設定整理、audit、協働設定レビューの明示依頼時に発動。CLAUDE.md・AGENTS.md（Codexレビュー規則）・agents・skills・rules・hooks・MCP の重複、配置、発火条件、権限を評価する。docs棚卸しやskill新設判断では発動しない。
effort: medium
maxTurns: 15
---

# AI設定の棚卸し(audit-ai-config)

Dayopt の AI 協働設定を棚卸しし、不要・重複・配置間違い・発火条件の曖昧さを検出する。削除や移動は提案としてまとめ、ユーザー承認後に実行する。

## When to Use

**明示発動型** — この skill はユーザーの explicit な AI 設定棚卸し意図のみを契機に発動する。

- 「AI設定を棚卸しして」「設定を整理して」など、AI 協働設定全体の audit が明示された時
- `.claude/`（agents / skills / rules / hooks）、`AGENTS.md`、MCP 設定の重複や配置を点検するよう指示された時
- skill / rules / agents / hooks の使い分けをレビューするよう指示された時
- AI 設定の削除候補・統合候補・発火条件改善案をまとめるよう指示された時

## When NOT to Use

この skill は **explicit AI 設定棚卸し意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- docs の棚卸し・鮮度確認 → `/gardening`
- docs gap の検出・技術ドキュメント更新 → `docs-writing` skill
- skill 新設・description 書式判断 → `.claude/rules/skill-design.md`

## 前提（現在の構成）

- 実装・運用ガイダンスの正本は `CLAUDE.md` と `.claude/rules/`。ローカルで動く coding agent は Claude のみ
- 外部レビュー（OpenAI Codex のクラウドレビュー、`@codex review`）は 2026-08-13 時点で運用停止中。レビューは内製クロスレビュー（`pr-cross-review` skill）が担う。Codex 向けレビュー規則は `AGENTS.md` に凍結保存してあり、再開時のために残す
- review subagent の role 本文は `.claude/agents/*.md` に直接置く（間接層を挟まない）
- 旧構成（`.codex/` overlay・`.agents/` roles/skills symlink・AGENTS.md 共通入口）は 2026-08-05 に撤去済み。経緯は `docs/engineering/log/2026-08-05-codex-review-only.md`
- 旧 `.claude/commands/*.md` は 2026-08 に `.claude/skills/{name}/SKILL.md`（明示発動型）へ統合済み。`.claude/commands/` ディレクトリは存在しない

## Inventory

以下を列挙し、件数・責務・最終更新・重複候補を確認する。

- `.claude/skills/*/SKILL.md`（明示発動型を含む、旧 commands 相当）
- `.claude/agents/*.md`（read-only reviewer の role 本文を含む）
- `.claude/rules/*.md`
- `.claude/hooks/*`
- `.claude/settings.json`
- global MCP 設定（`~/.claude.json` の user scope。repo には置かない — `.claude/rules/mcp-usage.md` 参照）
- `CLAUDE.md`
- `AGENTS.md`（Codex クラウドレビュー規則）

Agent と AGENTS.md は次も確認する。

- `.claude/agents/` の review agent が read-only tool allowlist（Read / Grep / Glob）を持ち、write 経路・nested delegation が無い
- `AGENTS.md` がレビュー規則専用に保たれている（実装・運用ガイダンスが逆流していない）。レビュー規則と `.claude/rules/` の規約が食い違っていない
- purpose-built writer 例外が明示起動・単独 writer・限定 scope になっている
- 実装委譲の writer 例外が 4 条件（Main と同一 worktree、非重複 scope、commit 前に Main が `git diff` をレビュー、commit / push / external state mutation は Main に残す）を満たしている。とくに diff レビューと commit 境界を省いた運用になっていないか

## Review Questions

各項目を次の質問で評価する。

1. **使用実績**: `git log -1` の日付を鮮度の根拠にしない（このリポジトリの clone は `.git/shallow` を持ち、2026-07-15 の 3 commit が親なしの境界になるため、それ以前の実質変更もすべて 2026-07-15 に誤帰属する）。代わりに **被参照数**（`rg --hidden --glob '!.git/**'` で他ファイルからの参照・呼び出しをカウント）と、必要なら到達可能な範囲での**実質 diff**（`git log --follow -p`。境界 commit で差分が付かない場合は `git show <sha>:<path>` で前後の内容を直接比較する）を根拠にする。docs / commands からの被参照も含めて判断し、3 か月以上使われた形跡がないものは削除候補にする。
2. **適材適所**: もっと下位の仕組みで代替できないか。判断不要・毎回実行するものは hooks か package.json script へ、短い常時ルールは CLAUDE.md / rules へ、単発 CLI で済む外部連携は MCP ではなく CLI 運用へ寄せる。
3. **重複**: CLAUDE.md、rules、skills、docs で同じ規約を二重管理していないか。正本を 1 箇所に決め、他は参照に落とす。
4. **トリガー品質**: skill の description / When to Use は発火条件として具体的か。対象ファイル、作業種別、NOT 条件が曖昧なものは書き直し案を出す。
5. **Agent権限**: review agent に write / external mutation / nested delegation の経路がないか。宣言だけで信用せず、tool allowlist と実際の挙動（negative test）を確認する。

## Output

以下の 3 分類で短く提案する。

- 削除提案: 対象、理由、復元方法
- 移動・統合提案: 移動元、移動先、正本にする理由
- 改善提案: description / When to Use / NOT 条件の修正文案
- 権限監査: read-only agent、writer例外、未検証のtool surface

実行まで指示された場合は path-limited add を使い、コミットメッセージは `chore: AI設定の棚卸し(YYYY-MM)` とする。

## Safety

- `~/.claude.json`、`~/.claude/settings.json`、`~/.claude/plugins/` など個人側の認証・インストール状態は削除対象にしない。
- repo 内の `.claude/settings.local.json` のような local state は、削除提案前に git 管理対象かを確認する。
- 「無効化して様子見」を基本方針にしない。git 管理対象で不要と判断できるものは削除候補にし、必要なら履歴から復元する。
- parent session の live permission が child の既定値を上書きし得る platform では、manifestだけを security boundary と表現しない。
- purpose-built writer を review role へ一般化しない。writer 例外は `.claude/rules/ai-behavior.md` §Writer ownership の条件をすべて満たすものだけにする。
