---
status: current
last_verified: 2026-08-10
code:
  - apps/product/package.json
  - apps/product/scripts/mcp-conformance.ts
  - apps/product/scripts/mcp-conformance-expected-failures.yml
  - apps/product/src/app/api/mcp/_protocol-handler.ts
  - apps/product/src/app/api/mcp/__tests__
---

# Step 6 — MCP protocol verification

## Purpose

DayoptのMCP endpointが、実装者の読み合わせだけでなく、再現可能なprotocol試験と3 clientの実機試験の両方を通ることを確認する。

## Current main contract

現在の`main`は次の構成である。

- `@modelcontextprotocol/sdk` `^1.30.0`
- `WebStandardStreamableHTTPServerTransport`
- requestごとにserverとtransportを作るstateless構成
- JSON responseを有効にした単一のStreamable HTTP経路
- server-side session storageなし

repo testは、protocol handler、route、server、tool registryを通して少なくとも次を固定している。

- 認証済みrequestだけがMCP contextを作れる
- token、connection、client、resource、scopeが同じcontextへbindされる
- `tools/list`はeffective scopeでfilterされる
- tool registryの名前とscopeがexact setで一致する
- credentialなし、形式不正、無効token、scope不足、一時的な認可障害を分ける
- request size、rate limit、JSON-RPC batch拒否をMCP処理より前で強制する

これらはDayopt固有の安全境界を検証するが、公式conformance suiteの代替ではない。

## Historical evidence and current gap

[2026-07-29の履歴](../../engineering/log/2026-07-29-mcp-2026-07-28-conformance.md)では、integration source branch上のofficial alpha suiteが`server-stateless` 24 / 28、`tools-list` 2 / 2を通った。

そのharnessとv2 runtimeは候補7の選択的移植に含めなかった。alpha suiteの数字（`server-stateless` 24 / 28等）は現在のsuiteに同名scenarioが存在しないため、過去の数字を現在のrelease proofとして扱わない。

2026-08-10にharnessをv1 SDK向けへ書き直して復活させた（下記 §Current harness）。

## Current harness

- 実行command: `pnpm --filter product test:mcp:conformance`（外部networkへ公開しない。127.0.0.1の一時HTTP serverに`handleMcpProtocolRequest`を載せ、`@modelcontextprotocol/conformance` CLIをchild processで走らせる）
- suite version: `@modelcontextprotocol/conformance@0.1.16`（exact pin。v2系の分割SDKパッケージには依存しない）
- 対象spec: `--spec-version 2025-11-25`（`@modelcontextprotocol/sdk` 1.30.0の`LATEST_PROTOCOL_VERSION`と一致）
- baseline: `apps/product/scripts/mcp-conformance-expected-failures.yml`。許可する failure は「suite専用diagnostic toolの不在」と「意図的に実装しないoptional capability（Dayopt MCPはtoolsのみを宣言）」の2種だけで、各IDに理由をコメントで残す。baseline外のfailure / warningはCLIが非0 exitで落とす
- 2026-08-10時点の結果: active suite 30 scenario、pass 7（`server-initialize` / `ping` / `tools-list` / `tools-call-simple-text` / `tools-call-error` / `dns-rebinding-protection` / `server-sse-multiple-streams`はwarningのみ）、expected failure 23（resources / prompts / logging / completion等の未宣言capability 13、診断tool不在 10）
- **`tools-call-simple-text` / `tools-call-error` のpassが証明するのはJSON-RPC envelopeまで**。registryにsuite専用toolが無いため、両scenarioは「未知toolへの`isError: true`応答が期待するtext / errorの形に合う」ことしか検証しない。実toolのdispatchと成功応答はconformanceの責務にせず、repo testが固定する: `protocol-handler.test.ts`（`tools/call`のframing）と`mcp-plan-mutations-apply` / `mcp-record-mutations-apply`等のintegration test（実DBでのtool実装経路）。test専用toolをproduction registryへ追加しない方針（下記）を優先し、harness専用のtool注入も行わない
- SDK 1.30の`allowedHosts` / `allowedOrigins`はdeprecatedのため、host / origin検証（DNS rebinding protection）はharness側のadapterが自前実装する
- **`dns-rebinding-protection`のpassはadapter境界の検証であり、production routeの検証ではない**。`route.ts`は`rejectUnexpectedOAuthHost`（request URLのhost固定）とbearer認証で境界を張り、Origin headerは意図的に拒否しない — browser上で動くMCP client（web版のChatGPT / Claude等）は正当なcross-origin fetchでOriginを送るため、Origin拒否はclosed betaの対象clientを壊しうる。DNS rebindingはlocalhost dev serverを標的にする攻撃で、公開HTTPS + bearer必須のremote endpointでは「Host固定 + token無しは401」が同じ攻撃を終端する。この判断を変える場合（Origin allowlistの導入等）は3 client実機検証とセットで行う
- harness contextはregistryの全requiredScope（read 4 + write / delete 4）を持つfull-scope固定。read-onlyだとwrite系toolが`tools/list`に現れずschemaのspec準拠が未検証のままpassする。scope filterの挙動自体（read-only contextでwrite toolが見えない）はunit testが固定しており、conformanceの責務にしない

## Required release evidence

closed beta候補のexact SHAで次を満たす。

1. 現在の公式conformance suiteと対象MCP specificationのversionを固定する
2. repo内の1 commandで、外部networkへ公開せずにsuiteを再実行できるようにする
3. active server suiteの結果、warning、既知failure IDを保存する
4. 既知failureが「suite専用diagnostic toolの不在」または「意図的に実装しないoptional capability（Dayopt MCPはtoolsのみを宣言）」だけに由来することを確認する
5. baselineにないfailure、warning、未実行testを失敗として扱う
6. suite更新時は、expected failureが実際に実行されていることを人が確認する
7. ChatGPT、Claude、Cursorの実機でOAuth discovery、resource indicator、tool discovery、tool callを確認する

test専用toolをproduction registryへ追加しない。conformanceを通すために認可、rate limit、request size、untrusted data境界を弱めない。

## Evidence record

検証結果には次だけを保存する。

- candidate SHA
- Node、SDK、suite、specのversion
- 実行command
- suite別のpass / failure / warning件数
- expected failure IDと理由
- 実行日時と担当者

token、Authorization header、OAuth code、PKCE verifier、user ID、operation ID、Plan / Record本文、raw HARは保存しない。

## Release boundary

次の状態ではwrite gateを開かない。

- 現在のcandidate SHAでofficial conformanceを再実行できない
- baseline外のfailureまたはwarningがある
- expected failureが未実行・skipされているだけか判別できない
- 3 clientのいずれかでresource indicator、OAuth discovery、tool listの意味が一致しない
- repo testとofficial suiteのどちらかが失敗する

protocol conformanceが通っても、正規データ変更の安全性やclient UIの確認体験までは証明しない。残りは[client beta verification](./step-6-client-beta.md)で検証する。
