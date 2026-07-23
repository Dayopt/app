---
status: frozen
date: 2026-07-23
---

# MCP 定義を repo から撤去し、global 設定へ一本化する

## 背景・当時の前提

- MCP の認証方式は 2026-06-16 に 2 系統（OAuth / `op run` 自己解決）へ整理し、平文トークンゼロと起動経路非依存を達成していた。残っていたのは「設定をどこに置くか」だった
- 2026-07-22 `7b19cbdef` で repo の `.mcp.json` / `.codex/config.toml` から 6 サーバー（eagle / context7 / sentry / playwright / github / vercel）を global（`~/.claude.json` / `~/.codex/config.toml`）へ移した
- 2026-07-23 朝 `ce9c48fba` が「repo 固有の MCP 契約を維持する」として 6 サーバーを repo へ戻した。この時、2026-06-16 に廃止したはずの **旧 sentry 定義（`npx @sentry/mcp-server` + `SENTRY_ACCESS_TOKEN` の stdio 方式）ごと復活**していた
- Codex は global と repo の同名 `[mcp_servers.*]` をキー単位でマージする。global の `url = "https://mcp.sentry.dev/mcp"` と repo の `command = "npx"` が同居し、`invalid configuration: url is not supported for stdio in mcp_servers.sentry` で MCP 全体が起動しなくなった
- このエラーは以前にも起きており、`7b19cbdef` の repo 定義削除が事実上の修正になっていた。しかし `ce9c48fba` で汚染源が main に戻ったため再発した。「直した状態」が未コミットの working tree にしか無く、正史は壊れたままだった

## 決定と理由

**repo から MCP 定義を全撤去し（`.mcp.json` 削除、`.codex/config.toml` は `shell_environment_policy` のみ残す）、global 設定のみを正とする。**

- repo と global の二重定義は、方式が食い違った瞬間に MCP 全体を起動不能にする。sentry の再発はその実例で、二重定義がある限り同じ事故が繰り返される
- 正を 1 箇所にすれば「どちらを直すか」の判断が不要になり、全 repo・全 worktree・全起動経路（desktop / web / zsh）で同じ MCP が使える
- repo を clone しただけでは MCP 構成が見えなくなるが、`.claude/rules/mcp-usage.md` に 9 サーバーの登録内容一覧を置いて再現性を担保する

## 却下した選択肢と、なぜ捨てたか

- **repo の sentry ブロックだけ削除する（最小修正）**: エラーは止まるが、github / playwright / vercel の二重定義は残る。将来どちらかの方式が変わった時に同じ事故が起きる
- **repo 固有 3 サーバーだけ残す（7/22 時点の形）**: read-only + project-ref 固定という契約が repo に残る利点はあるが、global 側と重複したままで「正がどちらか」が曖昧になる
- **repo に全 9 サーバーを置き global を空にする**: 他 repo での MCP 利用が壊れる。Dayopt 以外でも同じサーバー群を使っている

## 影響・やること

- `.mcp.json` を削除、`.codex/config.toml` の `[mcp_servers.*]` を削除
- `.claude/rules/mcp-usage.md` を global 管理前提に更新し、9 サーバーの登録内容一覧と sentry 再発の注意を追記
- `.claude/skills/audit-ai-config/SKILL.md` と `.agents/roles/plan-fact-checker.md` の `.mcp.json` 参照を global MCP 設定に差し替え
- provider 間の実装差は現状維持: eagle（Claude=公式 `http://127.0.0.1:41596/mcp` / Codex=Dayopt.library 内の自作 server）、context7（Claude=npx stdio / Codex=hosted URL）、supabase cloud（Codex は supabase plugin で代替）
- **rollback 用スナップショット**（撤去した repo 定義）:
  - `.mcp.json`: `supabase-local` = `http://127.0.0.1:54321/mcp`、`storybook` = `http://localhost:6006/mcp`、`supabase` = `op run -- npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=yvglwblxrnrenfifsnje`（env `SUPABASE_ACCESS_TOKEN=op://Dayopt-Staging/supabase/SUPABASE_ACCESS_TOKEN`）、ほか eagle / context7 / sentry / playwright / github / vercel
  - `.codex/config.toml`: sentry（旧 stdio 方式）/ supabase-local / github / playwright / storybook / vercel
  - 完全な内容は `git show ce9c48fba` で復元できる
