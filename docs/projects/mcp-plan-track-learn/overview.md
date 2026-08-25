---
status: active
last_verified: 2026-08-03
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/app/api/oauth
  - apps/product/src/lib/mcp
  - apps/product/src/lib/oauth-server
  - apps/product/src/features/timeblock
  - supabase/schemas/017_tables_oauth.sql
  - supabase/schemas/040_functions.sql
---

# mcp-plan-track-learn — 外部AIからPlan → Track → Learnを完結する

## Goal

Dayopt MCPは、ユーザーの予定、実績、時間上の制約、レビューを外部AIへ正確に提供し、権限を持つAI clientから受けた操作だけをDayoptの正規データへ安全に反映する標準接続面である。

最終的なプロダクト価値は、外部AIから次の一周を完結できることにある。

1. **Plan** — 予定、アクティビティ、制約を読み、Planを作成・更新する
2. **Track** — 実績をRecordとして記録・更新する
3. **Learn** — PlanとRecordの差をレビューし、次のPlanへ反映する

## Responsibility boundary

write scopeを持つ対応clientからのtool callは、Dayoptの正規データへ直接反映する。操作ごとの確認はclientが担う。Dayoptはclientが確認した事実を検証せず、次を保証する。

- 接続、resource、scope、Pro entitlementが現在も有効である
- 同時書き込み、時間重複、古いversion、再送を安全に扱う
- 成功した変更をpayload-free receiptとして追跡できる
- global / client gateでwriteを一時停止し、connection revokeで対象familyを恒久停止できる

Dayopt内にproposal、approval URL、承認状態機械は作らない。`confirmed: true`のような自己申告fieldも受け付けない。判断の背景は[操作確認をclientへ委ねる決定](../../product/log/2026-07-23-mcp-client-confirmed-direct-write.md)に記録する。

## Current state

段階導入8候補のうち候補1〜7が`main`へ入り、MCP / OAuth endpoint、read tool、write tool、安全なDB command、retention用DB RPC、外部接続maintenance routeまでをdark releaseした。closed betaはまだ完了していない。

gate値、enabled client、未検証項目、未実装blockerといった実行状態はこのファイルに持たない。append-only ledgerは[#1754](https://github.com/Dayopt/dayopt/issues/1754)、残りの手順と閉じるべきblockerは[Step 6 execution checklist](./step-6-execution-checklist.md)を正本とする。外部操作の前にはliveの値を再確認する。

## Public tool and scope contract

`tools/list`は、現在の接続が実行できるtoolだけを返す。scopeを後から増やす場合は再authorizationと再接続を行う。

| Scope              | Tools                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| `read:entries`     | `entries.list`, `plans.list`, `plans.get`, `records.list`, `records.get` |
| `read:activities`  | `activities.list`, `categories.list`, `segments.list`                    |
| `read:constraints` | `constraints.get`                                                        |
| `read:stats`       | `review.get`                                                             |

`read:tags` / `tags.list` は #2162 で `read:activities` へ alias なしクリーン置換された（production 実測 0 件、migration `20260818150000`）。表は実装済みの現行契約のみを載せる。
| `write:plans` | `plans.create`, `plans.update` |
| `delete:plans` | `plans.trash.list`, `plans.delete`, `plans.restore` |
| `write:records` | `records.create`, `records.update` |
| `delete:records` | `records.trash.list`, `records.delete`, `records.restore` |

公開metadataは一般提供する4つのread scopeだけを広告する。write / delete scopeはclosed betaの対象clientにだけ発行する。write / delete scopeは`read:entries`を必須とする。

## OAuth and connection contract

- 対応client IDは`claude-ai`、`chatgpt`、`cursor`のstatic allowlistとする
- public clientはPKCE S256を必須とする
- authorization request、code exchange、access token、refresh tokenを正規化済みresourceとconnectionへbindする
- resource URIはURLとしてparseし、configured originと正規化比較する。userinfo、query、fragment、非default port、想定外pathを拒否する
- redirect URIはclientごとの登録値と厳密一致させる
- authorization codeは一回限りとし、交換をtransaction化する
- refreshでscopeとresourceを拡大しない。rotationのreuseを検知したfamilyは失効する
- connection revoke RPC、再認証期限、scope喪失、client gate、entitlement喪失を次のrequestとwrite transactionで再検証する
- codeとtokenの平文、Authorization header、raw tool inputをlogやreceiptへ保存しない

credentialなし、形式不正、無効token、scope不足、一時的な認可障害は別のHTTP結果として扱う。一時障害を再authorization loopへ変換しない。

## Mutation contract

- generic JSON executorではなく、Plan / Recordごとのtyped commandを使う
- create/update/delete/restoreは`operationId`を冪等性keyとする。同じclientとoperation IDで同じ要求が再送された場合はreceiptを再生し、別payloadへの使い回しは拒否する
- update/delete/restoreは`expectedUpdatedAt`を必須にし、古い画面やAIが新しい変更を上書きしないようexact versionで比較する
- connection、token、resource、scope、reauth期限、client gate、global gate、entitlementをtransaction内で再検証する
- Plan同士、Record同士の時間重複はDB exclusion constraintを最終防衛線にする。通常UIとMCPが同時に書いても片方だけが成立する
- mutationとreceiptは同じtransactionでcommitする。失敗したmutationの本文は監査用に保存しない
- `plans.delete`と`records.delete`はsoft deleteであり、restore可能とする
- MCPから作るPlan / RecordはAPI由来として識別する。Recordだけが完了済みPlanへの`planId`を持てる

## Read consistency and product convergence

- `plans.list` / `records.list` / `get`は安定したresource IDとversionを返す
- `activities.list`、`categories.list`、`segments.list`、`constraints.get`、`review.get`は最小限のprojectionだけを返す
- `constraints.get`と`review.get`の複数readは、user revisionとtimezoneが変わっていない一貫した時点に揃える。互換用`entries.list`はbest-effortな複数readであり、同じsnapshot保証を持たない
- DBとserverにはuser revision境界があるが、現在のProduct UIはrevisionをpollしていない。Calendar、Inspector、Reviewの外部変更追従と20秒SLAはStep 6の未完了項目とする
- legacy text outputは外部由来のtitle、noteなどをuntrusted dataとして警告付きで囲む。`structuredContent`は構造化するだけで同じ囲みを持たないため、3 clientがモデルへの指示として誤採用しないことを別に実機確認する
- `deleteAllData`、account削除、connection revokeにはMCP authorityと競合しないDB command境界がある。OAuth / receipt retentionの実行と完了判定は未完成である

## Delivery

| Step | Outcome                                                      | State       |
| ---- | ------------------------------------------------------------ | ----------- |
| 1    | OAuth connection、resource binding、revoke、scope filtering  | done        |
| 2    | DB overlap防止、typed command、exact version、通常UI cutover | done        |
| 3    | transaction内再認可、idempotency receipt、write gate         | done        |
| 4    | Plan / Record read・create・update・delete・restore          | done        |
| 5    | tags、constraints、review、consistent read、local E2E        | done        |
| 6    | 3 client実機検証、旧経路cleanup、Production beta             | in progress |

## Completion boundary

このProjectは、次をすべて満たした時に完了する。

- 旧input、旧RPC、旧connectionの利用が0である証拠を取り、候補8を安全に完了する
- isolated ephemeral PreviewでChatGPT、Claude、Cursorの3 clientが同じ公開契約を扱える
- 各clientでPlan → Track → Learn、再送、revoke、並列refresh、UIとの同時書き込みを確認する
- responseのID、時刻、timezone、Plan / Record関係、外部由来情報が3 clientで同じ意味になる
- Settingsから自分のconnectionを確認・revokeでき、解除後のtoken familyが復活しない
- client停止時に既存write connectionを恒久失効する仕組みを実装するか、一時停止と個別revokeを組み合わせた運用契約を固定する
- retention backlog、account削除、停止手順、監視がProduction運用に耐える
- 明示承認したclientだけを1 clientずつ有効にし、問題時に即時停止できる

## Reversibility

- runtime allowlistを空にすれば、新しいwrite scopeの利用を止められる
- durable client gateをOFFにすると、そのclientのwrite scopeを一時的に除外できる。既存connection / tokenは失効しない
- global gateをOFFにすると、全clientの新しいwriteを停止できる
- 恒久停止にはconnection revokeを使い、同じfamilyのtokenが失効したことを確認する
- gate再開で停止前のconnectionが復活しない契約が必要なら、Production beta前にDB commandを追加する
- schema cleanupのような破壊的変更は、削除前のzero-use証拠とforward restoration migrationを用意して別の明示承認境界で行う

## Deferred scope

- Dynamic Client Registration
- Dayopt内proposal / approval UI
- 汎用タスク管理や会議自動生成
- durableな個別resource URLが決まる前の一時的なdeep link公開
