---
status: current
last_verified: 2026-07-23
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/lib/oauth-server
  - apps/product/src/features/timeblock/server
  - supabase/migrations
---

# Step 3 — MCP mutation envelope

## Goal

OAuth MCPの1回のwrite tool callを、現在の接続権限を再検証した単一DB transactionとして公開idempotency window内に一度だけ正規データへ反映する。

## Current implementation slice

- `plans.create`のtyped DB applyとserver-only adapterはローカル実装済み。global controlはOFFのままで、MCP toolには未登録
- 同一operationの直列・並列retry、異なるpayloadでのoperation ID再利用、90日window、再authorization、token/connection/Pro/global gate失効、account削除、通常UI commandとの同時間帯raceをintegration testで検証済み
- adapterはraw service-role clientを公開せず、DB message・title・note・tokenをerror / log / Sentryへ渡さない。deadlockだけを同じoperation IDで一度再試行する
- Plan update/delete/restore、Record全操作、実HTTP二経路、外部変更cache反映、Settings hard deleteとのserializationは未実装

## Minimum Viable Approach

### 1. Durable receiptを追加する

- public inputはUUIDの`operationId`一つだけとし、これを内部idempotency keyとして使う。別の`idempotencyKey` fieldは公開しない
- service-ownedのwrite receipt tableを追加し、`user_id + client_id + operation_id`を一意にする。適用元`connection_id`は監査fieldとして別に保持する
- success receiptをMCP mutation auditの正本とし、request digest、tool名、resource種別、resource ID、適用時version、適用時刻だけを保持する。既存`oauth_audit_log`へ同じ成功mutationを二重記録しない
- digestはDB内で`SHA-256(canonical JSON { envelopeVersion, toolName, normalizedArgs })`として構成する。stored tool名とdigestの両方が一致する時だけ既存receiptを返し、片方でも異なれば`IDEMPOTENCY_KEY_REUSED`で拒否する
- authorizationをlock下で確認した後、`user_id + client_id + operation_id`から作るtransaction advisory lockをreceipt lockとして取得する。既存receiptを確認してからdomain commandを実行し、成功fieldが全て揃った完成receiptだけを最後にinsertする。同じ操作の並列実行はadvisory lock待機後に片方がreceipt replayとなり、失敗transactionや未完成claim rowは残らない
- receipt tableはRLSを有効化し、`PUBLIC` / `anon` / `authenticated`から全権限をrevokeする。service roleにも直接`INSERT` / `UPDATE` / `DELETE`を付与せず、成功receiptはtyped `SECURITY DEFINER` applyだけがdomain mutationと同じtransactionでinsertする。監査用の最小`SELECT`だけをservice roleへ付与し、ユーザー向け表示は本文を返さない別service経路で後から追加する
- 同じuser/clientの再authorization後も、現在のauthorizationを先に検証した上で同じoperation ID + tool/digestのreceiptを再生する。response lossとconnection更新が重なっても正規データを二重適用しない
- receiptの`user_id` FKは`ON DELETE CASCADE`、監査用`origin_connection_id` FKは`ON DELETE SET NULL`とする。connection削除後もuser/client/operation IDの冪等性証跡を維持し、account削除時は既存`auth.admin.deleteUser()`のDB transactionで即時消去する
- public idempotency windowは成功mutationから90日とする。applyはreceipt lock取得後にDB時刻で期限切れreceiptを削除してからclaimし、遅延cleanupがあってもwindow後のoperation IDを新しい操作として扱えるようにする。service-only background cleanupも同じcutoffとreceipt lockを使う
- connectionの直接INSERT / DELETE権限はrevokeし、直接UPDATEはusage timestampだけに絞る。service-only connection cleanup RPCはauthorization code exchangeのlock順を`connection → code`へ揃えた後の別migrationで追加し、revoked/expired状態をlock下で再検証してhard deleteする。receiptは削除せず`origin_connection_id = NULL`となり、90日windowを維持する
- 拒否attemptは成功mutation監査の保証対象に含めない。payloadを持たないsecurity log/metricとして有限保持し、success receiptと混ぜない

### 2. Apply時のauthorizationをDBで再検証する

- access token、connection、user、client、canonical resourceのbindingを検証する
- singletonのDB global control rowを初期OFFで追加し、全applyのlock順を`global control → auth.users → connection → access token → profile → receipt advisory lock → domain resource`に固定する。connectionからuser候補をlockなしで解決し、`auth.users`を`FOR KEY SHARE`した後に同じuser bindingのconnectionを共有lock下で再検証する。これによりaccount削除の親子FK lock順と揃えつつ、global stop、revoke/refresh/scope/gate/downgrade writerのUPDATEとlinearizeする。global control変更は単調増加するrevisionのCASを必須にし、緊急停止より古いenable要求を拒否する
- access tokenの有効期限・revoke・required scope、connectionのrevoke・reauth期限・scope・grant markerをDB時刻で検証する
- `write_enabled_at`とは別にnullable `write_disabled_at`を追加する。DB triggerでnon-NULLからNULLへの変更とtimestamp差替えを拒否し、service-only disable RPCだけがNULLからDB時刻へ進める。一度disableしたconnectionは再authorizationで新しいconnectionを作る
- runtime client allowlistはtool discovery、新規write grant、HTTP token preflightを制御する。DB applyはglobal control、authorization時の`write_enabled_at` grant marker、connectionが未disable、token/connectionのrequired scopeを権威とする。client単位の停止は対象connectionを全てdisableしたtransactionの完了を境界とし、その後にruntime allowlistを閉じる。gate OFF時もread scopeは維持する
- `profiles`のentitlement rowを共有lockし、`active` / `trialing` / `past_due`以外は拒否する。MCP writeは現行の一般`BILLING_ENFORCED` flagとは独立したPro契約とする
- runtime envはtool discovery、新規grant、HTTP token preflightのgateであり、in-flight applyの停止完了境界には使わない。global停止はDB global control rowのUPDATE完了、client停止は対象connectionのdisable RPC完了を境界とし、その後にruntime allowlistを閉じる

| DB global control | Runtime allowlist | Connection grant | Required scope | Pro      | Effective write                            |
| ----------------- | ----------------- | ---------------- | -------------- | -------- | ------------------------------------------ |
| off               | any               | any              | any            | any      | hidden / cached call 403。read scopeは維持 |
| on                | off               | any              | any            | any      | hidden / cached call 403。read scopeは維持 |
| on                | on                | disabled         | any            | any      | hidden / cached call 403。read scopeは維持 |
| on                | on                | active           | missing        | any      | hidden / cached call 403                   |
| on                | on                | active           | granted        | inactive | hidden / cached call 403。read scopeは維持 |
| on                | on                | active           | granted        | active   | visible。DB transactionで権威条件を再検証  |

### 3. Typed apply RPCだけを作る

- Plan / Recordのcreate/update/delete/restoreごとにtyped apply RPCを作り、既存の`*_command_v1`をtransaction内で呼ぶ
- 共通lock順、authorization assertion、canonical digest、receipt advisory lock/replayはData API非公開の`private` schemaへ一度だけ実装する。各public typed RPCはrequired scope、tool名、typed domain command引数だけを所有し、private helperを呼ぶ前にservice-role JWT assertionをwrapper自身で必ず実行する
- generic JSON executor、SQL文字列dispatch、任意table/column指定は作らない
- createの`source`は`api`に固定する。update/delete/restoreは`expectedUpdatedAt`必須とする
- success responseは`schemaVersion: 1`、`operationId`、`resourceType`、`resourceId`、`version`、`deletedAt`、`replayed`だけの最小receiptにする。最新本文が必要ならget toolを使うが、2026-07-23現在の`plans.get` / `records.get`はregistry上の候補名だけで未登録なので、write tool公開前に実装する

### 4. MCP toolへ接続する

- tool descriptorでtool名、required scope、register callbackを一組にし、`tools/list`登録とcached-call preflightの集合を一致させる
- `apps/product/src/app/api/mcp/_server.ts`でeffective scopeがあるtoolだけを登録する
- tool inputはUUID `operationId`、ISO 8601日時、既存のtimeblock制約に対応する明示fieldだけを受け、unknown fieldを拒否する
- route前段の403 challengeを維持し、handlerとDB transactionでもrequired scopeを再検証する
- domain errorをstable codeへ変換し、DB messageや入力本文をMCP error、log、Sentry contextへ出さない
- `plans.delete` / `records.delete`はreversibleなsoft deleteであり、hard deleteではない。trash list/delete/restoreはいずれも`delete:*` scopeとする
- 3 clientで同じgolden request/responseを通し、tool名、scope matrix、`operationId`、receipt schemaを公開契約のdecision logとしてclosed beta前に固定する
- 外部mutationを開いているCalendar / Inspectorへ20秒以内に反映するuser revision pollingと、Settings `deleteBlocks` / `deleteAllData`のuser単位serializationをwrite tool登録の前提にする

### 5. Public write contractを閉じる

- 通常UI deploymentのdrainとProduction data preflightを確認してから、authenticatedのPlan / Record table privilegeを別migrationで一旦全てrevokeし、`SELECT`だけ再付与する
- 旧`soft_delete_plan`、`soft_delete_record`、`confirm_day_plans_to_records`のEXECUTEもrevokeする。`restore_plan` / `restore_record`と新`*_command_v1`は既にservice-role限定なので重複した契約にしない
- タグ削除・再割当て・mergeとSettingsの`deleteBlocks` / `deleteAllData`はservice-owned例外writerとして一覧化する。update/detachはrow versionを進め、hard deleteはcommandとserializeして最終状態を削除済みにできることを検証する
- 問題時は必要最小限のtable privilegeと旧RPC EXECUTEだけを戻す追加migrationをroll-forwardとして用意する
- deploy単位は`DB expand PR → UI command deploy → 旧browser writerゼロの観測証跡 → ACL-only PR → MCP mutation DB expand → MCP tool deploy`に分ける。全系列と逆GRANTをPersistent Stagingで先に検証し、このintegration branchをそのまま単一Production PRとしてmergeしない
- ACL適用前後の両方で動くUI command版appをroll-forward基準にする。ACL後に旧direct-write版へcodeだけrollbackするとwrite不能になるため、先に検証済みの逆GRANT migrationを適用する
- MCP writeを有効化するapp deploymentは、timeblock command、mutation receipt、typed apply、ACL contractの必要versionが全て適用済みの場合だけ起動する

ProductionのDB expand前に、次のread-only queryが`0`であることを証跡化する。ローカルは2026-07-23時点で`0`、Productionは未確認。違反行があれば自動修復せず、Planのskipを戻すかRecordの関係を直すかを行単位で決める。

```sql
SELECT count(*)
FROM public.records AS record
JOIN public.plans AS plan
  ON plan.id = record.plan_id
 AND plan.user_id = record.user_id
WHERE record.deleted_at IS NULL
  AND plan.skipped_at IS NOT NULL;
```

`20260722233722`だけが適用され、後続preflightで停止した場合も適用済みmigrationを編集・削除しない。write gateを閉じたままforward-onlyのbridge migrationで復旧する。

## Required Tests

- 同じoperation ID + 同じtool/digestの直列/並列retryは正規行1件、receipt1件になり、片方がreplayになる
- 同じuser/clientが再authorizationした後も、90日window内の同じoperation ID + tool/digestは旧receiptを再生する
- 同じoperation ID + 異なるtoolまたはdigestは正規データを変えず拒否する
- access token検証後からapplyまでの間にconnection revoke、scope撤回、connection gate、Pro downgrade、reauth expiry、token revokeが起きた場合は変更しない。DB barrierで各writerのcommit後に待機中applyが拒否されることを検証する
- global controlの停止完了後はin-flight applyを含めて変更せず、再開後は新しいrequestだけを許可する。stale revisionを使ったenableは停止状態を上書きできない
- `write_disabled_at`はNULLから一度だけ設定でき、service roleの直接UPDATEでもNULL戻し・timestamp差替えを拒否する
- stale versionのupdate/delete/restore、restore対create、同一時間帯createを正規化されたerrorで拒否する
- persistent Stagingで実session JWTのtRPC入口と実opaque tokenのMCP HTTP入口をDB barrierで同期し、Plan / Record双方で成功1件、失敗1件、最終行1件、stable error codeを検証する
- 3 client × granted scope × global/client/connection gate × revoke/downgradeのmatrixで`tools/list`とcached callを検証する
- receipt/audit/log/Sentry eventにtitle、note、tag名、token、raw payloadが含まれない
- authenticatedのPlan / Record table writeと旧3 write RPCはACL contract後に失敗し、own rowの`SELECT`、通常UI、MCP typed commandは成功する
- authenticatedに`TRUNCATE / REFERENCES / TRIGGER / MAINTAIN`を含む不要なtable privilegeが残らない
- 90日window内のreceiptはbackground cleanupできず、期限切れreceiptのeager cleanup・background cleanup・同operation applyを並列化しても一度だけ新規claimされる。connection cleanup後もuser/client/operation IDによるreplayが成立する
- 既存account削除の`auth.admin.deleteUser()`成功時にreceiptがcascade deleteされ、Storage/Stripe/Admin APIを跨ぐ現在の削除フローへ新しい部分commitを追加しない

## Reversibility Table

| Step                                         | Tag            | Rollback / roll-forward                                                        |
| -------------------------------------------- | -------------- | ------------------------------------------------------------------------------ |
| receipt tableとtyped apply RPCの追加         | [hours]        | write gateを閉じる。additive schemaは残し、修正版migrationを追加               |
| MCP tool registration                        | [minutes]      | tool登録を外すかdurable global controlを閉じる                                 |
| authenticated privilege / 旧write RPC revoke | [hours]        | 必要最小限のprivilegeだけを戻す追加migrationを適用                             |
| operation IDとreceiptの公開field             | [irreversible] | 3 clientのgolden contract後はfieldを維持し、additiveなschema versionでだけ拡張 |

## Existing Code to Reuse

- `apps/product/src/lib/mcp/auth.ts` — token/connection bindingとruntime client gate
- `apps/product/src/app/api/mcp/_tools/registry.ts` — 現在のscope requirement registry。tool registrationとの一元化対象
- `apps/product/src/features/timeblock/server/timeblock-command-client.ts` — typed RPC入力とdomain error mapping
- `apps/product/src/features/tags/server/tag-association-strategy.ts` — command外に残るservice-owned一括writer
- `apps/product/src/features/auth/server/user-service.ts` — Settingsのblock/all-data hard deleteと既存account削除フロー
- `supabase/migrations/20260722233722_timeblock_atomic_commands.sql` — Plan / Record typed command、CAS、ownership check
- `supabase/migrations/20260722235621_timeblock_command_hardening.sql` — skip/link invariantとrace hardening
- `supabase/migrations/20260514000918_mcp_phase_1_5.sql` — read tool call auditの既存出発点
- `packages/billing/src/subscription.ts` — Pro entitlement status集合

## What I'm Not Doing

- Dayopt内proposal、approval URL、承認状態機械
- clientが確認したことを示す`confirmed: true`の受理
- publicな`idempotencyKey`と`operationId`を別々に持つこと
- batch changeset、generic JSON mutation、hard delete
- skip/unskip、confirm-day、ワンタップ記録のMCP初期公開
- mutation失敗payloadの永続化
- authenticated tRPC write procedureをOAuth bearerへ公開すること
- タグ削除・mergeの一括処理をtimeblock単行commandへ置き換えること
