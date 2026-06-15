# mcp-server クローズサマリー

初回実装日: 2026-05-01

最終監査日: 2026-06-15

状態: **Phase 1 実装済み、Phase 1.5 以降は部分実装で保留**

> **overview**: [overview.mdx](./overview.mdx)。overview の Phase 分割を基準に、現在の repository で確認できる実装だけを到達済みと判定した。

## Project ゴール

Pro user が `mcp.dayopt.app` を Custom Connector に登録し、Dayopt が発行する OAuth 2.1 token で read-only MCP tool を利用できるようにする。Phase 1 は Tomoya の solo dogfood、Phase 1.5 は最初の有料 user 受け入れ、Phase 2 は DCR と複数 client 対応、Phase 3 は公開 docs を対象とした。

## 主要コミット

| SHA        | 日付       | 内容                                                                                         |
| ---------- | ---------- | -------------------------------------------------------------------------------------------- |
| `e461a126` | 2026-05-01 | Remote MCP server + OAuth 2.1 Phase 1 PoC（PR #1117、66 files / +4,231 / -628）              |
| `0f3a36a8` | 2026-05-01 | `oauth_tokens` の user UPDATE policy を削除し RLS を強化（PR #1118）                         |
| `63c86aca` | 2026-05-01 | migration workflow の Production environment 名を修正（PR #1119）                            |
| `cca5f30d` | 2026-05-01 | DB types 再生成と OAuth service-role client の型絞り込み（PR #1121）                         |
| `a0e0ebdb` | 2026-05-01 | AS / RS metadata URL を固定し issuer 一致を確保（PR #1127）                                  |
| `2b14484e` | 2026-05-01 | production rewrite 問題を避け、実体 `/api/mcp` / `/api/oauth/token` を advertise（PR #1128） |
| `d55e3203` | 2026-06-04 | production に存在していた Phase 1.5 migration 履歴を repository に復元（PR #1257）           |

## 現在確認できる成果

- OAuth authorization code + PKCE S256、refresh token rotation、opaque access token を実装
- `oauth_tokens` / `oauth_authorization_codes` schema と RLS を実装
- AS / protected-resource metadata endpoint を実装
- Streamable HTTP MCP endpoint と `entries.list` read-only tool を実装
- bearer token を DB lookup し、expiry / revoke / scope を確認する認証経路を実装
- MCP URL を Settings に表示し、Pro entitlement で gate
- token hash のみを DB 保存し、生 token を保存しない設計を維持
- `oauth_audit_log` と atomic token pair RPC の migration は repository に存在

## 未完・現行コードとの不一致

Phase 1 の実機完了基準と Phase 1.5 以降は、現在の repository だけでは完了を証明できない。

- Claude.ai connector からの end-to-end dogfood 成功記録が summary / test として残っていない
- `verifyAccessToken` と OAuth mode の `proProcedure` を覆う専用 unit test が現存しない
- Settings は接続済み client 一覧 / revoke UI ではなく、`apiKey: null` の vestige を残す
- `mcp.revokeToken`、`entries.daily_summary`、DCR `/oauth/register` は未実装
- `/oauth/authorize` / `/oauth/token` / MCP endpoint の専用 rate limit は現行コードで確認できない
- `oauth_audit_log` table はあるが、MCP tool call からの audit insert は確認できない
- atomic `issue_oauth_token_pair` RPC は migration にある一方、`code-exchange.ts` は未置換 TODO を残す
- production rewrite 問題により、overview の versionless public URL ではなく実体 API path を advertise する follow-up が入っている

2026-05-14 journal には Phase 1.5 完了とあるが、上記の current code と一致しないため、本 summary では repository の現状を優先して **部分実装** と判定する。

## ハマり点 / 学び

- OAuth metadata の issuer / endpoint は環境変数任せにせず、公開 origin と厳密一致させる必要がある
- Vercel rewrite を public contract に含める場合、production での実 URL smoke test が不可欠
- migration が production に存在しても git history から欠落すると、実装状態と schema state の監査が難しくなる
- journal の「完了」だけでは完了証拠にならない。E2E、専用 test、current UI、route wiring を揃えて close-out する必要がある

## 残課題 / 再開条件

再開時は Phase 1.5 の旧 checklist をそのまま消化せず、現在の MCP SDK / OAuth metadata / connector 要件を再調査する。その上で次を独立 issue に分ける。

1. OAuth / MCP auth unit test と connector E2E の復元
2. atomic token pair RPC への接続
3. audit log、rate limit、subscription revoke の現行要件確認
4. connected client 一覧と user revoke UI
5. DCR、ChatGPT / Cursor 対応、tool 拡充は利用実績を確認してから判断
