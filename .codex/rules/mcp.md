# Codex MCP 運用

Codex 固有の MCP 起動範囲だけをここに置く。Claude 共通の MCP 方針は `.claude/rules/mcp-usage.md` を canonical source とする。

## 配置は user-global のみ

**MCP サーバーの定義はすべて `~/.codex/config.toml` に置く。repo の `.codex/config.toml` には `[mcp_servers.*]` を一切書かない。**

Codex は user-global と repo-local の同名 table を統合するため、HTTP の `url` と stdio の `command` / `args` が混在すると設定読込に失敗する（`invalid configuration: url is not supported for stdio`）。この事故が実際に起きたため 2026-07-23 に repo-local 定義を全撤去した。経緯は [2026-07-23-mcp-global-consolidation.md](../../docs/engineering/log/2026-07-23-mcp-global-consolidation.md)。

新しい Codex 環境では `~/.codex/config.toml` に次を追加する。

```toml
[mcp_servers.context7]
url = "https://mcp.context7.com/mcp"

[mcp_servers.supabase-local]
url = "http://127.0.0.1:54321/mcp"

[mcp_servers.storybook]
url = "http://localhost:6006/mcp"

[mcp_servers.sentry]
url = "https://mcp.sentry.dev/mcp"

[mcp_servers.vercel]
url = "https://mcp.vercel.com"

[mcp_servers.playwright]
command = "npx"
args = ["-y", "@playwright/mcp@latest"]

[mcp_servers.github]
command = "op"
args = ["run", "--", "github-mcp-server", "stdio"]

[mcp_servers.github.env]
GITHUB_PERSONAL_ACCESS_TOKEN = "op://Dayopt-Shared/github-mcp-pat/credential"

[mcp_servers.eagle]
command = "/absolute/path/to/node"
args = ["/absolute/path/to/Dayopt.library/.mcp/eagle-library/src/server.js"]
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.eagle.env]
EAGLE_LIBRARY_PATH = "/absolute/path/to/Dayopt.library"
```

`eagle` の絶対パスは各環境の Node.js と Eagle library に合わせる。

## サーバー別の運用

- `github`: issue / PR / branch 状態確認で頻繁に使う。`op run -- github-mcp-server stdio` が `op://Dayopt-Shared/github-mcp-pat/credential` を自己解決する
- `supabase` cloud: Codex では `supabase@openai-curated` plugin で代替するため MCP 登録しない。Codex 起動時の 1Password unlock を増やさない
- `supabase-local`: 1Password と無関係な local HTTP MCP。ローカル DB が落ちている時の接続失敗は異常扱いしない
- `eagle` / `storybook`: ローカルアプリが起動している時だけ使う。接続失敗を異常扱いしない

## 1Password masking

`op run` は stdout / stderr の secret masking が既定で有効。MCP server へ env token を渡すだけなら `--no-masking` は使わない。
