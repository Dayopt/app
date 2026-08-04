---
status: current
last_verified: 2026-08-03
code:
  - apps/product/package.json
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

そのharnessとv2 runtimeは候補7の選択的移植に含めなかった。現在の`main`には同じ結果を再現するcommandがないため、過去の数字を現在のrelease proofとして扱わない。

## Required release evidence

closed beta候補のexact SHAで次を満たす。

1. 現在の公式conformance suiteと対象MCP specificationのversionを固定する
2. repo内の1 commandで、外部networkへ公開せずにsuiteを再実行できるようにする
3. `server-stateless`と`tools-list`の結果、warning、既知failure IDを保存する
4. 既知failureがsuite専用diagnostic toolだけに由来することを確認する
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
