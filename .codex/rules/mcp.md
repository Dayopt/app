# Codex MCP 運用

Codex 固有の MCP 起動範囲だけをここに置く。Claude 共通の MCP 方針は `.claude/rules/mcp-usage.md` を canonical source とする。

## 常時起動

- `github`: issue / PR / branch 状態確認で頻繁に使うため `.codex/config.toml` に置く。`op run -- github-mcp-server stdio` で `op://Dayopt-Shared/github-mcp-pat/credential` を自己解決する。

## オンデマンド

- `supabase` cloud: production schema / RLS / advisors の確認時だけ使う。Codex 起動時の 1Password unlock を増やさないため、`.codex/config.toml` には置かない。
- `supabase-local`: 1Password と無関係な local HTTP MCP なので `.codex/config.toml` に残す。ローカル DB が落ちている時の接続失敗は異常扱いしない。

## 1Password masking

`op run` は stdout / stderr の secret masking が既定で有効。MCP server へ env token を渡すだけなら `--no-masking` は使わない。
