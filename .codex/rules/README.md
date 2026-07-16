# Codex Rules Overlay

`AGENTS.md` は Dayopt で作業する coding agent の共通入口であり、Human–Agent Partnership と authority level の正本。詳細ルールは `.claude/rules/` を共通の canonical source とする。`.codex/rules/` には Codex 固有の運用差分だけを薄く置く。

## Policy

- 共通ルールを複製しない。Codex 固有の差分は短く、実行可能な形で書く
- hooks / MCP / local app state / custom agent config に関する Codex だけの情報は `.codex/rules/` に置いてよい
- ルールを増やす前に、`AGENTS.md` または `.claude/rules/` に置くべき共通内容でないか確認する

## Agent structure

- `.agents/roles/*.md`: provider-neutral な review role 本文の正本
- `.codex/agents/*.toml`: Codex custom agent の metadata、権限制約、正本への thin pointer
- `.claude/agents/*.md`: Claude subagent の metadata、tool allowlist、正本への thin pointer
- `playwright_test_planner` / `playwright_test_generator`: 明示的に起動する purpose-built writer 例外。Main と同じ output scope を同時編集しない

Review role の adapter に role 本文や変化しやすい project facts を複製しない。確認 command の実行が必要なら review role は Main へ返し、Main が実行する。

## Read-only boundary

Codex review agent は `sandbox_mode = "read-only"`、`approval_policy = "never"`、apps無効化、MCPを使わない developer instruction を defense-in-depth として設定する。

これは絶対的な security boundary ではない。親 turn で選択した live sandbox / approval override は child に再適用され得る。また、現行 Codex は custom agent 単位で親の `mcp_servers` を空にする設定を提供せず、transport を省いた `enabled = false` override は agent definition 自体を無効にする。

そのため Codex で review agent を自動利用する時は、親 session も非 elevated / read-only とし、親側で external write-capable MCP / plugin tool を無効にする。これを満たせない session では Codex role を hard read-only と呼ばず、Main が直接調査するか、tool allowlist を持つ別 provider の review agent を使う。agent追加・権限変更時は disposable worktree の constrained parent で negative write test を行い、write が成功した構成を利用しない。

## Files

- `git-workflow.md` — Codex での branch / commit / PR / merge 運用
- `mcp.md` — Codex 固有の MCP 起動範囲と 1Password masking 運用
- `browser.md` — Codex での共有 Chrome、内蔵 Browser、Playwright の選択順

## Canonical References

- `AGENTS.md` — 全 coding agent の共通入口と Human–Agent Partnership
- `.agents/roles/` — provider-neutral review role 本文
- `.claude/rules/workflow.md` — Dayopt 共通の作業・git 運用
- `.claude/rules/plan-format.md` — plan 出力形式
- `.agents/skills/` — 作業種別ごとの project skill
