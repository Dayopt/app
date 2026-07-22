---
status: active
last_verified: 2026-07-23
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/lib/oauth-server
  - apps/product/src/features/timeblock
  - supabase/migrations
---

# mcp-plan-track-learn — 外部AIからPlan → Track → Learnを完結する

既存のread-only MCPを、対応クライアントからPlan / Recordの正規データを安全に変更できる接続面へ拡張する大規模Project。認証、DB transaction、timeblock、Settings、Review、画面cacheを横断する。

## Goal

外部AIクライアントが、Dayoptの予定、実績、現在の時間制約、決定論的なレビューを読み、クライアント側の操作確認を経てPlan / Recordを直接変更し、次の計画まで更新できる状態にする。

公開上の責任分界は次に固定する。

> Dayoptはwrite scopeを持つ対応クライアントから受けた操作を正規データへ反映する。操作ごとの確認はクライアントの責任とし、Dayoptは確認済みであることを独立には検証しない。Dayoptは接続、scope、ドメイン制約、競合制御、冪等性、監査を保証する。

MCP tool call自体は承認証明ではない。`confirmed: true`のようなクライアント自己申告値は受け付けない。

## Current State

- Streamable HTTP、PKCE S256、static client 3種、opaque token、`entries.list` / `plans.list` / `records.list`は実装済み
- OAuth resource、stable connection、atomic code/refresh、connection revokeはローカル実装・検証済み
- `tools/list`は現在scopeでfilterし、cached tool callはroute前段で403 challengeを返す
- Plan / Record同種間の時間重複は既存GiST exclusion constraintで防止済み
- MCP write、stable connection、原子的CAS、冪等性、mutation audit、外部変更の画面反映、Learn用toolは未実装

接続基盤は半分以上、Plan → Track → Learnの顧客価値は約4分の1が現在地。

## Delivery

| Step                           | Outcome                                                                             | State   |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------- |
| 1. OAuth connection foundation | canonical resource、stable connection、atomic code/refresh、revoke、scope filtering | done    |
| 2. Atomic mutation foundation  | UI/MCP共通のCAS、DB overlap、idempotency、audit、revoke linearization               | active  |
| 3. Plan / Record MCP CRUD      | create/update/delete/restore/get/trash、structured errors/receipts                  | pending |
| 4. Context and Learn           | tags、constraints、review、Plan → Track → Learn E2E                                 | pending |
| 5. Product convergence         | user revision polling、Settings connection UI、retention、docs                      | pending |
| 6. Client beta verification    | ChatGPT / Claude / Cursor staging smoke、client別write gate                         | pending |

### OAuth and connection contract

- canonical resourceは専用host origin。scheme/host、default port、空path/`/`を正規化し、userinfo、query、fragment、非default port、その他pathを拒否する
- authorization request、token request、authorization code、access token、refresh tokenをresourceとconnectionへbindする
- connectionはgrant/refresh family単位。同じuser/clientの複数connectionを許可する
- access token 5分、refresh inactivity 30日、absolute reauthorization 90日。並列refreshは30秒のgrace内では勝者を維持し、grace外のreuseでfamily全体をrevokeする。成功responseを失ったclientは再接続する
- authorization code consume + token pair issue、refresh rotation + token pair issueをそれぞれ単一transactionにする
- scope/resourceはrefreshで拡大しない。不明scopeを一つでも含むrequestは全体を拒否する
- Settings revoke、scope撤回、entitlement喪失、再認証期限、client無効化後は次のDB transactionから書き込み不能にする

### Tool and scope contract

| Scope              | Tools                                                |
| ------------------ | ---------------------------------------------------- |
| `read:entries`     | `entries.list`, `plans.list/get`, `records.list/get` |
| `read:tags`        | `tags.list`                                          |
| `read:constraints` | `constraints.get`                                    |
| `read:stats`       | `review.get`                                         |
| `write:plans`      | `plans.create/update`                                |
| `delete:plans`     | `plans.trash.list/delete/restore`                    |
| `write:records`    | `records.create/update`                              |
| `delete:records`   | `records.trash.list/delete/restore`                  |

- `tools/list`は現在のconnectionで実行可能なtoolだけを返す
- cached tool callはhandlerとDB transactionで再認可し、scope不足ならHTTP 403 + `WWW-Authenticate`を返す
- beta write scopeはclient/connection allowlistで発行する。scope変更は再authorization + reconnectとする
- 既存list toolのtext出力は維持し、`schemaVersion: 1`のstructured contentを追加する

### Mutation contract

- Plan / Recordそれぞれのcreate/update/soft-delete/restoreをtyped commandとして実装し、generic JSON executorは作らない
- MCP mutation transactionはconnection lockと再認可、idempotency claim、正規データ変更、redacted audit、最小receiptを一括commitする
- createは既存のDB exclusion constraintを最終防衛線にし、constraint violationを`TIME_OVERLAP`へ変換する。Plan × Recordの重複は許可する
- update/delete/restoreは`expectedUpdatedAt`必須。versionとdeleted stateをmutation predicateに含める
- MCP createは`source = 'api'`。`from_plan`は既存のワンタップ記録専用とする
- foreign/nonexistent IDは区別せず`NOT_FOUND`とし、raw payload、title、note、tokenをreceipt/audit/logへ保存しない
- 同一idempotency key + 同一digestはreceiptを再生し、異なるdigestは拒否する

### Product convergence

- `constraints.get`はtimezone、DB現在時刻、occupancy、既存temporal ruleだけを返す。未保存の勤務時間やdeadlineは推測しない
- `review.get`は既存statisticsと決定論的signalを返し、集計期間と計算根拠を含める
- user単位revisionをPlan / Record変更時に更新し、Calendar / Inspector / Review表示中だけ15秒pollする。外部変更の反映SLAは20秒以内
- Supabase Realtimeは再導入しない

## Acceptance Criteria

- context取得 → Plan作成/更新 → linked Record作成 → review取得 → 次Plan更新が3 clientで成立する
- UI createとMCP createの同一時間帯raceで、Plan/Recordそれぞれ片方だけが成功する
- 同一versionの同時update、update対delete、restore対createで不正な最終状態を作れない
- connection revoke完了後に古いaccess tokenから正規データを変更できない
- retryで同一操作を二重適用せず、異なる要求のidempotency key再利用を拒否する
- scopeのないtoolは列挙されず、cached callも再認可される
- code/token/verifierとtimeblock本文がlog、Sentry、audit metadataへ出ない
- 外部MCP変更がCalendar / Inspector / Reviewへ20秒以内に反映される
- `pnpm check`、integration tests、RLS snapshot、docs checkが通る

## Reversibility

| Change                                           | Tag               | Rollback                                                       |
| ------------------------------------------------ | ----------------- | -------------------------------------------------------------- |
| 公開する責任分界・tool/scope/resource名          | [hard-to-reverse] | closed beta前に固定し、以後はversioned additive changeのみ     |
| connection/CAS/idempotency/audit/revision schema | [hours]           | write gateを閉じ、read-only MCPへ戻す。additive schemaは残せる |
| MCP write tool                                   | [minutes]         | client別またはglobal write gateで非表示・拒否                  |
| UI version必須化                                 | [hours]           | 欠落versionの一時許容へ戻しtelemetryを継続                     |
| revision polling                                 | [minutes]         | pollingを止めても正規データは変化しない                        |
| 旧token一斉失効                                  | [hard-to-reverse] | 再接続が必要なためProductionで別checkpointを置く               |

## Existing Code to Reuse

- `apps/product/src/lib/oauth-server` — static clients、PKCE、opaque token、metadata
- `apps/product/src/app/api/mcp` — stateless transportとcomposition layer
- `apps/product/src/features/timeblock/server` — Plan / Record guards、service、overlap/error mapping
- `supabase/migrations/20260708232500_add_time_model_tables.sql` — Plan / Record exclusion constraintとownership trigger
- `supabase/migrations/20260514000918_mcp_phase_1_5.sql` — atomic token pair RPCとauditの既存出発点

## What I'm Not Doing

- Dayopt内proposal、approval URL、承認状態機械
- OAuth bearerからpublic tRPC write procedureを直接許可すること
- batch changeset、hard delete、automatic tombstone purge
- skip/unskip、confirm-day、`plans.record`専用toolの初期公開
- 外部calendar write、勤務時間・deadlineの新規model
- DCR、CIMD、一般step-up authorization
- Supabase Realtime、in-app LLM review

## Rollout Checkpoints

1. local migration、unit/integration、RLS snapshot
2. PR Previewでread-only regressionとOAuth metadataを確認
3. fixed callbackが必要なためpersistent Stagingで3 clientの再authorization、確認UI、retry、parallel refreshを確認
4. client別write gateでclosed beta
5. Production write有効化と旧token失効は、証拠を提示して別々に明示権限を得る
