---
status: active
last_verified: 2026-07-26
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

- Streamable HTTP、PKCE S256、static client 3種、opaque tokenと、Plan / Record / Context / Learnの18 toolをrepo実装済み。runtime registryはtool名、required scope、register callbackを持つdescriptorを正本とし、登録集合もexact set testで固定する。`tools/list`には現在のeffective scopeで実行できるtoolだけを出す
- OAuth resource、stable connection、atomic code/refresh、DB connection revokeと古いaccess token拒否はローカル実装・検証済み。Settingsは同じclientの複数connectionを個別表示・revokeでき、revokeとwrite transactionをconnection row lockでlinearizeする
- protected resourceはcredentialなし/unsupported schemeを空bodyの401 discovery、malformed Bearerを400 `invalid_request`、invalid/expired/revoked tokenを401 `invalid_token`、scope不足を403、認可依存障害をretryableな503へ分離済み。step-up challengeは既存grant、`read:entries`、不足scopeを保持する。write/delete scopeが`read:entries`を欠くconnection/code/tokenはDB CHECKとgrant RPCの双方で拒否する
- `tools/list`は18 descriptorをeffective scopeでfilterし、cached tool callはroute前段で403 challengeを返す。MCP endpointはtoken検証前のcoarse IP ceilingと認証済みuser単位の専用rate limitを持ち、backend timeout時は再認証loopを起こさないretryable 503へfail closedする。[protocol revision 2025-06-18で廃止されたJSON-RPC batch](https://modelcontextprotocol.io/specification/2025-06-18/changelog)はrouteで一括拒否し、1 requestからのmutation増幅を許さない
- Plan / Record同種間の時間重複は既存GiST exclusion constraintで防止済み
- Plan / Recordのtyped command、exact CAS、DB時刻のtemporal rule、skip/link整合性はローカル実装済み。Plan / Record双方のcreate/update/delete/restoreで、通常UI commandとMCP typed applyの同時実行、stale CAS、restore対createをDB integrationで検証済み。実session JWTのtRPC対実opaque tokenのMCP HTTP create raceもローカルでPlan / Record双方を検証済み。Persistent Stagingの3 clientでは未検証
- repo上の通常UIはcreate/update/delete/restore/skip/record/confirm-dayをservice-owned commandへ切替済み。Calendar cacheもDBが返したraw `updated_at`をversionとして維持する。Production deployは未実施
- タグ削除・再割当て・mergeとSettingsの`deleteBlocks` / `deleteAllData`はservice-owned commandへ収束し、通常UI/MCPの単行writeと同じuser単位transaction advisory lockで直列化するrepo実装と競合試験まで完了した。新appは最終RPC名だけを呼び、旧deployment向けRPCはowner検証付きの一時compatibility wrapperへ置き換えている。Production適用と旧wrapperのdrain後revokeは未実施
- DB global control、durableなclient単位control、不可逆なconnection kill switch、payload-free receipt tableとreceipt-key serializationはrepo実装済み。client停止はcontrol row更新と既存write connectionのdisableを同一transactionで行い、grant、token検証、applyの3境界で再検証する。再有効化しても旧connectionは復活せず、再authorizationを必須とする。Plan / Recordのcreate/update/delete/restoreはtransaction内再認可、canonical digest、typed apply、receipt replayとserver-only adapterまでローカル実装・検証済み。Record createだけがcompleted Planへのlinkを受け、updateはPlan attribution・source・external provenanceを変更できない
- authenticatedのPlan / Record権限を`SELECT`だけにするACL cutoverはrepo実装済み。全migrationのfresh適用、継承roleを含むeffective table / column write権限のfail-closed監査、authenticated直接write拒否、旧deployment compatibility、service-role recoveryをローカル検証済み。Production適用、旧wrapperのdrain後revoke、逆GRANT rehearsalは未実施
- Plan / Recordのcreate/update/delete/restore/get/trash、全成功結果の`schemaVersion: 1` structured content、stable JSON text error、mutation receipt、strict public input、server-injected OAuth bindingはrepo実装・SDK contract test済み。trashのservice-role readはnarrow feature adapterへ閉じ、owner/deleted predicateと最小projectionを実DBのcross-tenant testで検証する
- global controlとdurable client controlは初期OFFで、write/delete scopeはtoken検証時にeffective scopeから落ちるため、現在のMCPはwrite toolを列挙せず正規データを変更できない
- Plan / Record commitと同じtransactionで進むuser revision、session用revision API、Calendar workspaceのvisible中10秒pollと復帰時の即時再確認、Inspectorの外部更新・削除transitionをrepo実装・検証済み。`tags.list`、`constraints.get`、`review.get`も最小projectionと独立read scopeで実装し、実MCP HTTP経由のPlan → Track → Learn flowとcross-tenant read isolationをlocal DBで検証済み。Persistent Stagingの3 client golden contractと実network / render込み20秒SLAは未検証
- `claude-ai` / `chatgpt` / `cursor`の3 client IDを同じlocal integrationへ通し、actual token route、scope-filtered `tools/list`、Plan retry、global OFF時の非永続化、parallel refresh、target-only revokeを検証済み。client所有外のredirect origin/scheme/pathはruntimeとenv validationの両方で拒否する。authorize page、client固有UI、3 clientそれぞれのfull Plan → Track → LearnはPersistent Stagingで未検証

Delivery 6段階のうち5段階がrepo上で完了した。Step 5のcontext / Learn tool、revision境界、Calendar同期、Inspector競合保護、local Plan → Track → Learn flowまで成立している。Step 6は[client beta verification](./step-6-client-beta.md)のrepo-side contractと顧客契約の決定まで完了し、残りはdeleteAllData/retentionの実装、isolated Persistent Staging、3 clientの実UI/network証跡、20秒SLA、retention運用である。

## Minimum Viable Approach

1. **MCP mutation transactionを完成させる** — connection/token/Pro entitlementをDB transaction内で再検証し、idempotency claim、typed command、成功mutation auditを兼ねる最小receiptを一括commitする。詳細は[Step 3設計](./step-3-mutation-envelope.md)を正本とする
2. **Plan / Record CRUD toolを段階公開する** — Plan / Recordの8 mutation、get/trash、structured contract、Settings connection管理、実HTTP対UI race、Step 5の画面同期までrepo上で完了した。global/client gateはOFFのまま維持し、削除時の接続契約とStep 6の3 client検証後だけ段階公開する
3. **public write境界をcommandへ収束する** — repo上では通常UI commandとACL cutoverまで実装済み。現在の未適用migration chainはrolling deploy中の全prefixを安全にしていないため、Productionでは書き込みquiescence下の一括cutover、または別のstaged compatibility chainを先にPersistent Stagingで実証する。service-owned一括処理は例外writerとして明示する
4. **Track → Learnを接続する** — constraints/tags/review tool、user revision polling、Inspector競合保護、local MCP HTTPのgolden flowまでrepo上で完了した。実network / render込み20秒SLAはStep 6のPersistent Stagingで測定する
5. **3 clientでclosed betaを検証する** — [Step 6計画](./step-6-client-beta.md)に従い、isolated Persistent Stagingで再authorization、retry、parallel refresh、revoke、UI対MCP raceを通し、client単位でwrite gateを開く

追加のDayopt内proposal/approval state machineは作らない。tool callを操作要求として扱い、確認UIを持つclientではclient側の確認結果に従う。Dayoptはclientの確認事実ではなく、接続権限とデータ整合性を検証する。

## Delivery

| Step                           | Outcome                                                                                     | State   |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------- |
| 1. OAuth connection foundation | canonical resource、stable connection、atomic code/refresh、revoke、scope filtering         | done    |
| 2. Atomic mutation foundation  | DB exclusion、typed command、exact CAS、DB時刻、通常UI cutover                              | done    |
| 3. MCP mutation envelope       | transaction内再認可、冪等性、audit receipt、旧public write経路revoke                        | done    |
| 4. Plan / Record MCP CRUD      | create/update/delete/restore/get/trash、structured success/JSON error/receipt、実二経路race | done    |
| 5. Context and Learn           | tags、constraints、review、revision polling、Plan → Track → Learn E2E                       | done    |
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

以下はrepo実装済みの候補契約。18 toolのdescriptor、実登録名、scope preflightはexact set testで一致させる。public contractとしての固定とwrite gate有効化は3 clientのgolden contract後に行う。

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
- credentialなし/unsupported auth schemeの401はerror情報を返さずdiscovery metadataだけをchallengeする。malformed Bearerは400 `invalid_request`、invalid/expired/revoked tokenは401 `invalid_token`、認可DBの不明状態は503 + `Retry-After`とし、再authorization loopへ変換しない
- write/delete scopeは常に`read:entries`を含む。追加scopeの403 challengeは現在のgrantを失わないよう、既存scope + base read + 不足scopeの和集合を返す
- 現在のbeta write scope発行は`MCP_WRITE_ENABLED_CLIENTS`のruntime preflightと、`mcp_mutation_control.enabled_client_ids`のdurable client gateの両方を必須とする。`write_enabled_at`はgrant marker、nullable `write_disabled_at`は不可逆なconnection kill switchとして維持する。scope変更または再有効化は再authorization + reconnectとする
- runtime client allowlistはdiscoveryとHTTP preflightを制御するが、権威やin-flight applyの停止完了境界には使わない。DBのglobal control、durable client control、authorization時のconnection grant marker、connection kill switch、granted scopeが全てONの時だけwrite scopeをeffectiveにする。いずれかがOFFでもread scopeは維持し、write toolだけを非表示、cached callを403にする。client停止はcontrol rowを先に更新し、対象clientのwrite connectionを同じtransactionで全てdisableする。完了後にruntime allowlistを閉じる
- 既存list toolのtext出力は維持し、全成功結果に`schemaVersion: 1`のstructured contentを追加する。SDK 1.29は`isError: true`でもsuccess output schemaに対してstructured contentを検証するため、errorは`schemaVersion`、stable code/message/retryableを持つJSON text + `isError`とし、structured contentを付けない
- `plans.delete` / `records.delete`はsoft deleteを意味する。trash list/delete/restoreは削除済みデータへの権限を含むため`delete:*` scopeへまとめる
- mutation inputの`operationId`をidempotency keyとして使い、別のpublic `idempotencyKey`は作らない。receipt fieldは[Step 3設計](./step-3-mutation-envelope.md)を候補とする
- idempotency namespaceはuser + client + operation IDとし、再authorization後も成功から90日間は同じreceiptを再生する。account削除成功時は既存`auth.admin.deleteUser()`のDB cascadeで即時消去する

### Mutation contract

- Plan / Recordそれぞれのcreate/update/soft-delete/restoreをtyped commandとして実装し、generic JSON executorは作らない
- MCP mutation transactionのlock順は`global control → timeblock global shared lock → transaction user/lock-mode bind → auth.users → user shared advisory lock → revision row → connection → access token → profile → receipt advisory lock → domain resource`に固定する。connectionからuser候補をlockなしで解決し、timeblock write境界をlockした後に同じuser bindingのconnectionを再検証する。通常UI commandも同じshared lock、Settings hard deleteとaccount deleteはexclusive lockを取る。shared→exclusive upgradeと別userへのrebindはuser固有lock前に拒否する。user/client/resource/scope/expiry/revoke/write gateを再検証し、global controlの変更はrevision CASで緊急停止より古いenable要求を拒否する
- `profiles`のPro entitlementもlockして、downgrade完了後のwriteを防ぐ。MCP writeはbilling enforcementの一般flagにかかわらず`active` / `trialing` / `past_due`を必須とするproduct contractとして扱う
- 再認可、idempotency claim、正規データ変更、成功mutation auditを兼ねる最小receiptを一括commitする。Settings revokeとscope撤回は同じconnection row lockでlinearizeする
- createは既存のDB exclusion constraintを最終防衛線にし、constraint violationを`TIME_OVERLAP`へ変換する。Plan × Recordの重複は許可する
- update/delete/restoreは`expectedUpdatedAt`必須。versionとdeleted stateをmutation predicateに含める。updateはfieldの省略を現状維持、明示的な`null`をnote/tag解除として扱い、空patchを拒否する
- MCP createは`source = 'api'`。`from_plan`はワンタップ記録とconfirm-dayによるDayopt内部のPlan変換専用とする
- foreign/nonexistent IDは区別せず`NOT_FOUND`とし、raw payload、title、note、tokenをreceipt/audit/logへ保存しない
- 同一operation ID + 同一tool/digestはreceiptを再生し、異なるtoolまたはdigestは拒否する
- 各public typed apply wrapperはprivate共通helperを呼ぶ前にservice-role JWTを独立に検証する。このassertionは新しいoperationを追加する時も省略しない
- domain command完了後、receipt insert前にもDB時刻でconnection/token/reauth期限を再検証し、command中に権限期限を跨いだtransactionを全体rollbackする
- server adapterはraw service-role clientやPostgREST builderを公開せず、operation固有methodからplain resultだけを返す。versioned receiptのresource IDをrequest対象へbindし、expected SQLSTATEだけをstable codeへ変換する。未知のDB failureはcodeだけを観測してraw message・cause・入力本文を破棄する
- DB変更はexpand/cutoverの2段階にする。repoでは通常UIのprimary timeblock callerをservice-owned commandへ移し、後続migrationでauthenticatedのPlan / Record table / column privilegeを全てrevokeして`SELECT`だけ再付与した。rolling deploy中の旧bundleが使う`soft_delete_plan`、`soft_delete_record`、`confirm_day_plans_to_records`は、owner検証と同じuser lockを持つ一時wrapperとしてだけ残す。Productionでは全migration適用とcompatibility確認後にappを切り替え、旧instanceのdrain完了後に別migrationでwrapperをrevokeする
- GiST競合が`40P01`を返した場合はservice境界で一度だけ再試行し、最終的なoverlap/version errorへ正規化する
- `confirmDay`は通常UI専用とし、tRPCとDBの両方で26時間を上限にする。MCP初期toolには公開しない

### Write tool公開前のブロッカー

- Step 4でSettings connection一覧/revoke、`plans.get` / `records.get` / trash、全read toolのstructured content、8 mutation handler、actual SDK contract、実HTTP対UI raceまでは完了した
- 外部MCP mutation後のCalendar / Inspector cacheは、repo上ではvisible中の10秒user revision pollingと復帰時の即時再確認で再検証する。実networkとrenderを含む20秒SLAはPersistent Stagingで実測し、満たすまでwrite toolを列挙しない
- `deleteAllData`後のconnection契約は[2026-07-26のdecision](../../product/log/2026-07-26-mcp-delete-all-data-retention.md)で固定した。Step 6で実装と競合試験を行い、3 clientのschema、retry、confirmation UXをPersistent Staging検証する

Settingsの`deleteBlocks` / `deleteAllData`とMCP applyのuser単位serializationはrepo上で完了した。writerが先なら後続purgeが削除し、purgeが先なら後続writerは成功できる。現在の`deleteAllData`はOAuth connection/token/receiptとCalendar authorityを残すため、まだ固定済みの目標契約を満たさない。

- local exclusive transactionで全MCP connectionとcode/tokenを失効し、Calendar connection/token/selection/cursorとユーザー所有のexternal event mirrorを削除する
- Plan、Record、tag、settingsに加えて週次・月次のAI生成reportを削除し、account維持に必要なprofile、課金状態、MFA recovery codeは残す
- local transactionで暗号化済みtokenをrevoke-only outboxへ移し、commit成功後だけprovider revokeをretryする。outbox tokenは成功時または24時間後に削除する
- payload-free receiptは再作成を防ぐ最小audit/idempotency tombstoneとして90日だけ残し、purge後のretryでは消えたresourceを成功として返さない
- 削除開始前のCalendar OAuth stateをuser data generationで拒否し、進行中syncとMCP applyが削除後にデータを戻せないようにする

この実装とPersistent Staging evidenceが完了するまでwrite toolを列挙しない。

### Product convergence

- `constraints.get`はtimezone、DB現在時刻、occupancy、既存temporal ruleだけを返す。未保存の勤務時間やdeadlineは推測しない
- `review.get`は既存statisticsと決定論的signalを返し、集計期間と計算根拠を含める
- user単位revisionをPlan / Record変更時に更新し、Calendar / Inspector / Review表示中だけ10秒pollする。外部変更の反映SLAは20秒以内
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
- 既存read toolを含む全toolの成功結果が`schemaVersion: 1`のstructured contentを返し、errorは同versionのstable JSON text + `isError`を返す
- mutation schemaは`confirmed: true`などclient自己申告の承認fieldを受理しない
- 全service-role例外writerを一覧化する。update/detachはversionを進めて通常UI/MCPのstale writeを拒否し、明示的hard deleteはcommandとserializeして最終状態を削除済みにできる
- code/token/verifierとtimeblock本文がlog、Sentry、audit metadataへ出ない
- protected resourceがcredentialなし/unsupported scheme、malformed Bearer、invalid token、insufficient scope、認可依存障害を401/400/401/403/503へ分離し、write-only OAuth grantを全保存surfaceで拒否する
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
- `apps/product/src/lib/mcp/mutation-contract.ts` — Plan / Record mutationのpublic input、最小receipt、stable error contract
- `apps/product/src/lib/mcp/mutation-db.ts` — service-role DB applyをoperation単位に閉じ込めたadapter
- `apps/product/src/lib/mcp/mutation-client.ts` — deadlock retryとDB error正規化を担うserver-only client
- `apps/product/src/features/timeblock/server/timeblock-command-client.ts` — service-roleを閉じ込めた通常UI用typed command adapter
- `apps/product/src/features/timeblock/server` — Plan / Record guards、service、overlap/error mapping
- `apps/product/src/features/tags/server/tag-association-strategy.ts` — command外に残るservice-owned一括writer
- `apps/product/src/features/auth/server/user-service.ts` — Settingsのblock/all-data hard deleteとaccount削除順序
- `supabase/migrations/20260708232500_add_time_model_tables.sql` — Plan / Record exclusion constraintとownership trigger
- `supabase/migrations/20260514000918_mcp_phase_1_5.sql` — atomic token pair RPCとauditの既存出発点
- `supabase/migrations/20260722233722_timeblock_atomic_commands.sql` — Plan / Recordのtyped commandとexact CAS
- `supabase/migrations/20260723123000_mcp_plan_mutations_apply.sql` — Plan create/update/delete/restoreのtyped MCP apply
- `supabase/migrations/20260723123100_recheck_mcp_plan_create_authority.sql` — domain command後のauthorization期限再検証
- `supabase/migrations/20260723123200_recordable_plan_error_contract.sql` — Record link先Planの状態エラーを`DT013`へ分離
- `supabase/migrations/20260723123300_recordable_plan_trigger_error_contract.sql` — direct triggerも同じ`DT013`契約へ統一
- `supabase/migrations/20260723123400_mcp_record_mutations_apply.sql` — Record create/update/delete/restoreのtyped MCP apply
- `supabase/migrations/20260723123500_timeblock_authenticated_acl_cutover.sql` — authenticatedをPlan / Recordの`SELECT`だけへ絞り、旧3 RPCをservice-role限定にするcutover
- `supabase/migrations/20260723123600_harden_timeblock_authenticated_acl_cutover.sql` — `ACCESS EXCLUSIVE`境界、全column ACL revoke、catalog assertionを追加するforward-only hardening
- `supabase/migrations/20260723123700_harden_timeblock_effective_privileges.sql` — 継承roleを含むeffective write権限の監査viewとfail-closed assertion
- `supabase/migrations/20260723130000_serialize_timeblock_user_writes.sql`〜`20260723130500_serialize_authenticated_user_data_writes.sql` — 通常UI、MCP、tag、Settings、account deleteを同じuser lock境界へ収束する
- `supabase/migrations/20260723130600_finalize_user_data_command_cutover.sql` — 全serialization完了後だけ新app向け最終RPC名を公開する
- `supabase/migrations/20260723130700_restore_legacy_timeblock_rollout_compatibility.sql` — 旧bundleをowner検証付きserialized wrapperで一時的に維持する
- `supabase/migrations/20260723130800_align_tag_require_empty_with_active_associations.sql` — active関連だけを削除確認の対象にし、trash-only blockはtagと一緒にhard deleteする既存挙動を維持する
- `supabase/migrations/20260723130900_serialize_legacy_restore_compatibility.sql` — 旧bundleのservice-role restoreも同じuser lockへ参加させる
- `supabase/migrations/20260723130950_preflight_oauth_write_scope_repair.sql` — write-only OAuth rowがあればrevokeだけでは足りないことを示してconstraint追加前に停止する
- `supabase/migrations/20260723131000_require_read_scope_for_oauth_writes.sql` — connection/code/tokenとgrant RPCでwrite/delete scopeのbase read invariantを強制する
- `supabase/migrations/20260723131100_durable_mcp_client_write_control.sql` — client単位controlをgrant、token検証、applyの3境界へ追加する
- `supabase/migrations/20260723131150_disable_pre_client_gate_write_connections.sql` — client gate導入前のwrite connectionを不可逆にdisableし、再authorizationを要求する

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

1. **Local** — 現行ブランチだけのfresh DBへ全migrationを適用し、RLS snapshotを一致させた。unit、MCP SDK contract、15 integration files / 207 tests、実MCP HTTPのPlan → Track → Learn flow、cross-tenant最小projectionを通し、RLS/effective privilege検査も維持する
2. **PR Preview** — read-only regressionとOAuth metadataを確認し、timeblock command migrationが`20260723011200`まで適用済みであることを確認する
3. **Persistent Staging** — current migration chainをUI/service write quiescence下で`20260726021453`まで完走し、data-less DBをStaging identityへ一度だけprovisionしてからcommand版appへ切り替えるmaintenance cutoverをrehearseする。別のrolling-compatible chainを作る場合は全prefixで旧/new bundle双方を試験する。その後、3 clientの再authorization、確認UI、retry、parallel refresh、revoke、UI対MCP race、逆GRANTと再cutoverのroll-forwardを確認する
4. **Production preflight（read-only）** — skip済みPlanにactive Recordが紐づく件数、`read:entries`を欠くwrite/delete connection/code/tokenが0、既存user/authorityによるProduction identity backfill条件、3 OAuth tableのrow数とlock waiter、migrationが部分適用でないことを確認する。違反データは自動修復せず、OAuth rowはretention/consent判断を経た削除またはscope修復、timeblockは行単位のdomain判断を行う
5. **Production maintenance cutover** — global control OFFを確認し、通常UIとservice-roleのtimeblock/tag/Settings/OAuth writeをquiesceして旧instanceをdrainする。3 OAuth tableのrow数とlock待ちを記録し、全migrationを`20260726021453`まで連続適用する。exact Production identity、3 resource FK、service-role function ACLと最終3 RPCだけが新app向けsurfaceであること、旧5 RPCがserialized compatibility wrapperであることを確認してからidentity検証版command appをdeployする。deployment SHAを固定してcreate/update/delete/restore/skip/record/confirm-day/tag/Settings purge/OAuth code exchangeをsmokeし、その後だけ通常writeを再開する
6. **Production compatibility observation** — 強制reloadまたは同等の導線を維持し、旧RPC利用数、旧input、lock timeout、serialization failureが0であることを観測する。異常時はglobal MCP gateだけに頼らず通常writeを再quiesceし、Staging検証済みのforward bridgeを適用する
7. **Production compatibility cleanup PR** — 旧instanceのdrainと旧RPC利用数0を確認してから、新timestamp migrationで一時compatibility wrapperのEXECUTEをrevokeする。適用済みmigrationは編集しない
8. **Production tool PR** — 直前のACL schema versionを確認し、tool codeだけを全gate OFFでdeployする
9. **Closed beta** — durable global controlをOFFのままmigrationとapp deployを完了し、旧instanceをdrainする。対象clientのdurable gate、runtime allowlist、global controlの順に開き、外部変更反映SLAと成功mutation audit欠損を監視する
10. **Production authority** — Production migration、ACL contract、write有効化、旧token失効は証拠を分け、それぞれ対象と環境を示して明示権限を得る

`20260723123500`だけ成功し`20260723123600`以降が失敗した場合は、command版appとglobal gate OFFを維持し、code rollbackしない。lock blockerを確認して同migrationを再試行し、必要なら新timestampのforward bridgeを追加する。旧codeへ戻す必要がある場合だけ、先にStaging検証済みの逆GRANT migrationを適用する。

`20260723130000`〜`20260723130700`には、一時的な旧RPC revoke、tag lock mode、table lockを後続migrationで置換するprefixがある。SupabaseとVercelのProduction deployにはDB先行を保証する単一transactionがないため、通常の無停止自動deployへこのchainをそのまま流さない。global MCP gate OFFだけではSettings/tagの旧writerを止められない。ProductionはHALTとし、書き込みをquiesceできるmaintenance手順、またはprefixごとに旧/new bundle双方が安全な別のstaged compatibility migration chainをPersistent Stagingで実証してから明示権限を得る。

`20260723131000`の通常`ADD CHECK`はconnection/code/tokenを検証する間table lockを取る。write-only rowがあれば`20260723130950`で先に停止し、revokeだけでは再試行しない。Production適用は3 tableのlive row数、write-only 0件、lock待ちとPersistent Stagingでの最大適用時間を証跡化し、OAuth writeをquiesceできるmaintenance境界を確保するまでHALTとする。無停止適用が必要なら、適用済みmigrationを編集せず`NOT VALID`追加と別transactionの`VALIDATE CONSTRAINT`へ分けたstaged chainを先に作る。

逆GRANTはauthenticatedへ必要な`INSERT / UPDATE / DELETE`と旧3 RPCの`EXECUTE`だけを戻し、`PUBLIC` / `anon` / `TRUNCATE`等を戻さない。復旧後の再cutoverは適用済みmigrationを再利用せず、新timestampのREVOKE + effective assertion migrationを使う。逆GRANTと再cutoverは一組でPersistent Staging rehearsalを完了してからProduction候補にする。
