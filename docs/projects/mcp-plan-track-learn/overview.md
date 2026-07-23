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

> Dayoptはwrite scopeを持つ対応クライアントから受けた操作を正規データへ反映する。操作ごとの確認はクライアントの責任とし、Dayoptは確認済みであることを独立には検証しない。Dayoptは接続、scope、ドメイン制約、競合制御、冪等性、成功mutationの監査を保証する。

MCP tool call自体は承認証明ではない。`confirmed: true`のようなクライアント自己申告値は受け付けない。

責任分界の判断は[操作確認をclientへ委ね、正規データへ直接反映する](../../product/log/2026-07-23-mcp-client-confirmed-direct-write.md)に記録する。

## Current State

- Streamable HTTP、PKCE S256、static client 3種、opaque token、`entries.list` / `plans.list` / `records.list`の3 toolは実装済み。他のregistry上のtool名は未登録
- OAuth resource、stable connection、atomic code/refresh、DB connection revokeと古いaccess token拒否はローカル実装・検証済み。Settings revoke UIとwrite transactionとのlinearizationは未実装
- 現在登録済みの3 toolについて`tools/list`はscopeでfilterし、cached tool callはroute前段で403 challengeを返す
- Plan / Record同種間の時間重複は既存GiST exclusion constraintで防止済み
- Plan / Recordのtyped command、exact CAS、DB時刻のtemporal rule、skip/link整合性はローカル実装済み。Plan createでは通常UI commandとMCP typed applyの同時実行で片方だけが成功することをDB integrationで検証済み。実session JWTのtRPC対実opaque tokenのMCP HTTP raceはPersistent Stagingで未検証
- repo上の通常UIはcreate/update/delete/restore/skip/record/confirm-dayをservice-owned commandへ切替済み。Calendar cacheもDBが返したraw `updated_at`をversionとして維持する。Production deployは未実施
- タグ削除・再割当て・mergeとSettingsの`deleteBlocks` / `deleteAllData`はPlan / Recordを直接更新・hard deleteするservice-owned例外writerとして残る。authenticated ACL cutoverの対象ではなく、一覧化と競合試験が必要
- DB global control、不可逆なconnection kill switch、payload-free receipt tableとreceipt-key serializationはrepo実装済み。`plans.create`のtransaction内再認可、canonical digest、typed apply、receipt replayとserver-only adapterもローカル実装・検証済み
- global controlは初期OFFで、`plans.create` toolと運用UIは未登録なので現在のMCPは正規データを変更できない。Plan update/delete/restore、全Record apply、rolling deploy互換のauthenticated table privilegeと旧write RPC、既存read toolのstructured content、外部変更の画面反映、Learn用toolは未実装

Delivery 6段階のうち2段階がrepo上で完了し、Step 3がactive。接続と正規データ境界の基盤は成立したが、Plan → Track → Learnのend-to-end顧客価値はまだ未達。

## Minimum Viable Approach

1. **MCP mutation transactionを完成させる** — connection/token/Pro entitlementをDB transaction内で再検証し、idempotency claim、typed command、成功mutation auditを兼ねる最小receiptを一括commitする。詳細は[Step 3設計](./step-3-mutation-envelope.md)を正本とする
2. **Plan / Record CRUD toolを段階公開する** — Plan create/updateを先に閉じたintegration testで通し、delete/restore、Recordの順で同じenvelopeへ載せる。各toolは現在scopeがあるconnectionだけに列挙する
3. **public write境界をcommandへ収束する** — 旧UI deploymentのdrainを確認してから、authenticatedのPlan / Record table privilegeを一旦全てrevokeして`SELECT`だけ再付与し、旧CASなしwrite RPCも別migrationでrevokeする。service-owned一括処理は例外writerとして明示する
4. **Track → Learnを接続する** — constraints/tags/review toolとuser revision pollingを追加し、MCP変更を開いているCalendar / Inspector / Reviewへ20秒以内に反映する
5. **3 clientでclosed betaを検証する** — persistent Stagingで再authorization、retry、parallel refresh、revoke、UI対MCP raceを通し、client単位でwrite gateを開く

追加のDayopt内proposal/approval state machineは作らない。tool callを操作要求として扱い、確認UIを持つclientではclient側の確認結果に従う。Dayoptはclientの確認事実ではなく、接続権限とデータ整合性を検証する。

## Delivery

| Step                           | Outcome                                                                                     | State   |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------- |
| 1. OAuth connection foundation | canonical resource、stable connection、atomic code/refresh、revoke、scope filtering         | done    |
| 2. Atomic mutation foundation  | DB exclusion、typed command、exact CAS、DB時刻、通常UI cutover                              | done    |
| 3. MCP mutation envelope       | transaction内再認可、冪等性、audit receipt、旧public write経路revoke                        | active  |
| 4. Plan / Record MCP CRUD      | create/update/delete/restore/get/trash、structured errors/receipts、実二経路race            | pending |
| 5. Context and Learn           | tags、constraints、review、revision polling、Plan → Track → Learn E2E                       | pending |
| 6. Client beta verification    | ChatGPT / Claude / Cursor persistent Staging smoke、retention、client別write gate、運用docs | pending |

### OAuth and connection contract

- canonical resourceは専用host origin。scheme/host、default port、空path/`/`を正規化し、userinfo、query、fragment、非default port、その他pathを拒否する
- authorization request、token request、authorization code、access token、refresh tokenをresourceとconnectionへbindする
- connectionはgrant/refresh family単位。同じuser/clientの複数connectionを許可する
- access token 5分、refresh inactivity 30日、absolute reauthorization 90日。並列refreshは30秒のgrace内では勝者を維持し、grace外のreuseでfamily全体をrevokeする。成功responseを失ったclientは再接続する
- authorization code consume + token pair issue、refresh rotation + token pair issueをそれぞれ単一transactionにする
- scope/resourceはrefreshで拡大しない。不明scopeを一つでも含むrequestは全体を拒否する
- Settings revoke、scope撤回、entitlement喪失、再認証期限、client無効化後は次のDB transactionから書き込み不能にする

### Tool and scope contract

以下はProject完了時の候補契約。現在登録済みなのは`entries.list`、`plans.list`、`records.list`の3 toolだけ。未公開の名前とresponse schemaは3 clientのgolden contractを通してからdecision logで固定する。

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
- 現在のbeta write scope発行は`MCP_WRITE_ENABLED_CLIENTS`によるclient allowlist。`write_enabled_at`はgrant marker、nullable `write_disabled_at`は不可逆なconnection kill switchとして維持する。scope変更または再有効化は再authorization + reconnectとする
- runtime client allowlistはdiscovery、新規grant、HTTP token preflightを制御するが、in-flight applyの停止完了境界には使わない。DBのglobal control、authorization時のconnection grant marker、connection kill switch、granted scopeが全てONの時だけwrite scopeをeffectiveにする。いずれかがOFFでもread scopeは維持し、write toolだけを非表示、cached callを403にする。client停止は対象connectionを全てdisableしたtransactionの完了を境界とし、その後にruntime allowlistを閉じる
- 既存list toolのtext出力は維持し、`schemaVersion: 1`のstructured contentを追加する
- `plans.delete` / `records.delete`はsoft deleteを意味する。trash list/delete/restoreは削除済みデータへの権限を含むため`delete:*` scopeへまとめる
- mutation inputの`operationId`をidempotency keyとして使い、別のpublic `idempotencyKey`は作らない。receipt fieldは[Step 3設計](./step-3-mutation-envelope.md)を候補とする
- idempotency namespaceはuser + client + operation IDとし、再authorization後も成功から90日間は同じreceiptを再生する。account削除成功時は既存`auth.admin.deleteUser()`のDB cascadeで即時消去する

### Mutation contract

- Plan / Recordそれぞれのcreate/update/soft-delete/restoreをtyped commandとして実装し、generic JSON executorは作らない
- MCP mutation transactionのlock順は`global control → auth.users → connection → access token → profile → receipt advisory lock → domain resource`に固定する。connectionからuser候補をlockなしで解決し、`auth.users`をlockした後に同じuser bindingのconnectionをlock下で再検証する。user/client/resource/scope/expiry/revoke/write gateを再検証し、global controlの変更はrevision CASで緊急停止より古いenable要求を拒否する
- `profiles`のPro entitlementもlockして、downgrade完了後のwriteを防ぐ。MCP writeはbilling enforcementの一般flagにかかわらず`active` / `trialing` / `past_due`を必須とするproduct contractとして扱う
- 再認可、idempotency claim、正規データ変更、成功mutation auditを兼ねる最小receiptを一括commitする。Settings revokeとscope撤回は同じconnection row lockでlinearizeする
- createは既存のDB exclusion constraintを最終防衛線にし、constraint violationを`TIME_OVERLAP`へ変換する。Plan × Recordの重複は許可する
- update/delete/restoreは`expectedUpdatedAt`必須。versionとdeleted stateをmutation predicateに含める
- MCP createは`source = 'api'`。`from_plan`はワンタップ記録とconfirm-dayによるDayopt内部のPlan変換専用とする
- foreign/nonexistent IDは区別せず`NOT_FOUND`とし、raw payload、title、note、tokenをreceipt/audit/logへ保存しない
- 同一operation ID + 同一tool/digestはreceiptを再生し、異なるtoolまたはdigestは拒否する
- 各public typed apply wrapperはprivate共通helperを呼ぶ前にservice-role JWTを独立に検証する。このassertionは新しいoperationを追加する時も省略しない
- server adapterはraw service-role clientを公開せず、operation固有methodだけを返す。expected SQLSTATEだけをstable codeへ変換し、未知のDB failureはcodeだけを観測してraw message・cause・入力本文を破棄する
- DB変更はexpand/cutoverの2段階にする。通常UIのprimary timeblock callerをservice-owned commandへ移した後に、別migrationでauthenticatedのPlan / Record table privilegeを全てrevokeして`SELECT`だけ再付与する。旧`soft_delete_plan`、`soft_delete_record`、`confirm_day_plans_to_records`のEXECUTEもrevokeする
- GiST競合が`40P01`を返した場合はservice境界で一度だけ再試行し、最終的なoverlap/version errorへ正規化する
- `confirmDay`は通常UI専用とし、tRPCとDBの両方で26時間を上限にする。MCP初期toolには公開しない

### Write tool公開前のブロッカー

- `plans.get` / `records.get`はscope registryに名前だけ存在し未登録。mutation receiptから最新本文を取得する導線として、公開済み扱いにせず実装・contract testを先に完了する
- 外部MCP mutation後、現在のCalendar / Inspector cacheはlocal mutation前提で最大5分staleになり得る。user revision pollingを実装し、表示中の外部変更反映SLA 20秒を満たしてからwrite toolを列挙する
- Settingsの`deleteBlocks` / `deleteAllData`はPlan / Recordを直接hard deleteする。MCP applyとのuser単位serializationと最終状態の規則を実装・競合試験してからwrite gateを開く

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
- retryで同一操作を二重適用せず、異なる要求によるoperation ID再利用を拒否する
- access token検証後、DB apply前にconnection revoke / scope撤回 / Pro downgradeが完了した場合は変更しない
- scopeのないtoolは列挙されず、cached callも再認可される
- tool registrationとscope registryのtool集合が一致し、registryだけに存在する未登録toolを公開済みと扱わない
- write scope付与後は対応toolが列挙され、connectionのwrite gateを閉じた後は再接続前のcached callも拒否される
- 既存read toolを含む全toolが`schemaVersion: 1`のstructured contentを返す
- mutation schemaは`confirmed: true`などclient自己申告の承認fieldを受理しない
- 全service-role例外writerを一覧化する。update/detachはversionを進めて通常UI/MCPのstale writeを拒否し、明示的hard deleteはcommandとserializeして最終状態を削除済みにできる
- code/token/verifierとtimeblock本文がlog、Sentry、audit metadataへ出ない
- 外部MCP変更がCalendar / Inspector / Reviewへ20秒以内に反映される
- Production cutover前のread-only preflightで、skip済みPlanにactive Recordが紐づく既存不整合が0件である
- app deploy前にtimeblock command migrationが`20260723011200`まで全て適用済みであり、途中版だけで稼働しない
- `pnpm check`、integration tests、RLS snapshot、docs checkが通る

## Reversibility

| Change                                           | Tag            | Rollback / roll-forward                                                              |
| ------------------------------------------------ | -------------- | ------------------------------------------------------------------------------------ |
| 公開する責任分界・tool/scope/resource名          | [irreversible] | clientが保存する契約なのでclosed beta前に固定し、以後はversioned additive changeのみ |
| connection/CAS/idempotency/audit/revision schema | [hours]        | write gateを閉じ、read-only MCPへ戻す。additive schemaは残せる                       |
| MCP write tool                                   | [minutes]      | client別またはglobal write gateで非表示・拒否                                        |
| authenticated table privilege / 旧RPC revoke     | [hours]        | 必要最小限のtable privilegeと対象RPC EXECUTEだけを戻すroll-forward migrationを適用   |
| UI version必須化                                 | [hours]        | command側は維持し、問題のあるUI callerだけを前版へ戻す                               |
| revision polling                                 | [minutes]      | pollingを止めても正規データは変化しない                                              |
| 旧token一斉失効                                  | [irreversible] | tokenの安全な復活は行わず、ユーザーに再authorizationしてもらう                       |

不可逆な公開名はclient discoveryと保存済み接続が参照するため、origin resourceと既存のtyped tool名をclosed beta前に固定する。別名への変更ではなくschema versionを上げたadditive拡張を使う。

## Existing Code to Reuse

- `apps/product/src/lib/oauth-server` — static clients、PKCE、opaque token、metadata
- `apps/product/src/app/api/mcp` — stateless transportとcomposition layer
- `apps/product/src/features/timeblock/server/timeblock-command-client.ts` — service-roleを閉じ込めた通常UI用typed command adapter
- `apps/product/src/features/timeblock/server` — Plan / Record guards、service、overlap/error mapping
- `apps/product/src/features/tags/server/tag-association-strategy.ts` — command外に残るservice-owned一括writer
- `apps/product/src/features/auth/server/user-service.ts` — Settingsのblock/all-data hard deleteとaccount削除順序
- `supabase/migrations/20260708232500_add_time_model_tables.sql` — Plan / Record exclusion constraintとownership trigger
- `supabase/migrations/20260514000918_mcp_phase_1_5.sql` — atomic token pair RPCとauditの既存出発点
- `supabase/migrations/20260722233722_timeblock_atomic_commands.sql` — Plan / Recordのtyped commandとexact CAS

## What I'm Not Doing

- Dayopt内proposal、approval URL、承認状態機械
- OAuth bearerからpublic tRPC write procedureを直接許可すること
- タグ削除・mergeの一括処理をtimeblock単行commandへ置き換えること。例外writerとして別途競合保証する
- batch changeset、hard delete、automatic tombstone purge
- skip/unskip、confirm-day、`plans.record`専用toolの初期公開
- 外部calendar write、勤務時間・deadlineの新規model
- DCR、CIMD、一般step-up authorization
- Supabase Realtime、in-app LLM review

## Rollout Checkpoints

1. **Local** — 全migration適用、unit/integration、DB lint、RLS snapshot、docs checkを通す
2. **PR Preview** — read-only regressionとOAuth metadataを確認し、timeblock command migrationが`20260723011200`まで適用済みであることを確認する
3. **Persistent Staging** — DB expand、UI command、ACL、MCP mutation DB、tool codeの全系列を適用し、3 clientの再authorization、確認UI、retry、parallel refresh、revoke、UI対MCP race、逆GRANT roll-forwardを確認する
4. **Production preflight（read-only）** — skip済みPlanにactive Recordが紐づく件数が0、migrationが部分適用でないことを確認する。違反データは自動修復せず、行単位で扱いを決める
5. **Production DB expand** — migrationを`20260723011200`まで適用し、旧UIをexpanded DBへ接続したcompatibility smokeを通す。`20260722233722`のtriggerは旧writerにも即時作用するため、この確認を省略しない
6. **Production UI command deploy** — service-owned command版UIをdeployし、create/update/delete/restore/skip/record/confirm-dayをsmokeする。旧deploymentと旧runtime callerのdrainを確認する
7. **Production ACL-only PR** — authenticatedからPlan / Recordの全table privilegeをrevokeし、`SELECT`だけ再付与する。旧3 write RPCのEXECUTEもrevokeする。問題時はStaging検証済みの逆GRANT migrationを使う
8. **Production MCP expand / tool deploy** — receipt、typed apply、durable global/connection kill switchを先にDBへ追加し、必要version確認後にtool codeを全gate OFFでdeployする
9. **Closed beta** — durable global control、runtime client allowlist、connection grantを順に開き、外部変更反映SLAと成功mutation audit欠損を監視する
10. **Production authority** — Production migration、ACL contract、write有効化、旧token失効は証拠を分け、それぞれ対象と環境を示して明示権限を得る
