---
status: current
last_verified: 2026-07-26
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/lib/oauth-server
  - apps/product/src/lib/test/integration
  - scripts/env/schema.ts
  - supabase/migrations
  - vercel.json
---

# Step 6 — Client beta verification

## Goal

Productionと認証・DB・secretを共有しないPersistent Stagingで、ChatGPT、Claude、CursorからDayoptのPlan → Track → Learnを完結し、clientごとのwrite gateを安全に開閉できる証拠を残す。

## Current state

2026-07-26時点ではStep 6は未完了であり、closed betaはHALTとする。

- repo内では18 tool、OAuth connection、typed mutation、receipt、global/client/connection gate、3 clientのstatic registration、local Plan → Track → Learn flowまで実装済み
- actual MCP HTTPのgolden flowはlocal DBと`chatgpt` client IDで検証済みだが、実clientのOAuth、confirmation UI、refresh token管理、実network/renderは未検証
- 3 client共通のactual token route、scope-filtered`tools/list`、単一Plan mutation retry、global gate、parallel refresh、Settings revoke契約をlocal integrationで検証済み。authorize page、client自身のtoken保存/並列処理、client別Plan → Track → Learnは未検証
- 2026-07-26のread-only external inventoryでは、Vercel projectは`product` / `web`、Supabase branchはdefault `main`だけであり、Persistent Stagingのproject/branch/固定originは存在しない
- OAuth issuer、resource、Vercel host routingはProduction originへ固定されており、現在のままではisolated Stagingを構成できない
- `deleteAllData`はPlan、Record、tag、settingsだけを削除する。MCP connection/token/receipt、Calendar connection/refresh token、calendar selection/sync cursor、external event mirrorは残るため、削除後に外部writeまたはcalendar syncでデータが再作成され得る
- mutation receiptの90日cleanup RPCはあるが、定期callerは未実装。authorization code、token、connection、security auditのretention契約も未確定
- client別redirect URI overrideとMCP resource/write allowlistはrepoのenv schema、1Password field inventory、`.op-env.local.example`へ追加済み。`apps/product/.env.example`はsecret guardが書き込みを遮断したため未更新で、実1Password/Vercel fieldの存在も未確認

global/client gateはfail-closedであり、上記blockerの解決まではOFFのまま維持する。Production migration、release、token失効、gate変更はこのStepのrepo作業に含めない。

## Minimum Viable Approach

### 1. Repo上の3 client contractを同じ試験へ収束する

`apps/product/src/lib/test/integration/mcp-client-beta-contract.integration.test.ts`で、`claude-ai`、`chatgpt`、`cursor`を同じtable-driven testへ通す。

- service-role fixtureでgrantを作り、actual authorization code exchange routeでPKCE S256、client ID、redirect URI、resource bindingを検証済み。authorize page自体は既存unitとPersistent Stagingで別に検証する
- actual opaque access tokenとMCP HTTP routeで`tools/list`を取得済み
- write grant時、global gate停止時のtool集合とcached callの403を検証済み
- same operation ID retry、different payload reuse、global OFF時の非永続化、actual parallel refresh winnerの継続利用、target-only revoke後のaccess/refresh拒否を検証済み
- full context → Plan create/update → linked Record create → review → next Plan updateは既存local goldenを維持し、実clientごとの差はPersistent Stagingで検証する

durable client/connection/Pro gateとfull Plan → Track → Learnは既存integrationで独立して維持する。新testはそれらを3 client分再実行したとは主張しない。また、実clientのconfirmation UI、client自身が送るparallel refresh、画面renderを証明しない。それらはPersistent Staging evidence matrixで別に確認する。

### 2. Staging provisioningに必要なenv契約を正本へ追加する

- `OAUTH_CLAUDE_REDIRECT_URIS`
- `OAUTH_CHATGPT_REDIRECT_URIS`
- `OAUTH_CURSOR_REDIRECT_URIS`
- `MCP_OAUTH_ENVIRONMENT`
- `OAUTH_AUTHORIZATION_SERVER_URI`
- `MCP_CANONICAL_RESOURCE_URI`
- `MCP_WRITE_ENABLED_CLIENTS`

上記をstaging/productionの`app` item、`.op-env.local.example`、Productの`.env.example`、Secrets運用docsへ揃える。client別redirect URIは完全なURIのcomma区切りだけを許可し、wildcard、userinfo、query、fragment、非default portを拒否する。Claude / ChatGPTは各社所有のHTTPS hostと既知path、Cursorは既知scheme・host・pathだけを許可し、値そのものはrepoへ保存しない。

schema testでは、3 clientのredirect URI overrideとMCP resource/write allowlistがstaging/productionの両inventoryにexactly once存在し、いずれもoptional public fieldであることを固定済み。environment markerとauthorization server URIはStaging identity設計の実装時にrequired条件を加える。

### 3. Customer contractをCHECKPOINTで固定する

repo内の安全策だけでは決められない次の意味を、external Stagingを作る前に一度だけ固定する。

1. **全データ削除**
   - 推奨: `deleteAllData`と同じuser exclusive transaction境界で全MCP connectionをrevokeし、未消費authorization code、access/refresh tokenを無効化する。Calendar connection、暗号化済みtoken、calendar selection/sync cursor、ユーザー所有の`external_calendar_events`も削除する
   - local DB purgeをexclusive transactionで先にcommitし、その成功後だけprovider revokeをtransaction外のbest-effort work itemとして実行する。DB purge失敗時はprovider revokeを呼ばないことをtestし、provider側が失敗してもlocal authority/dataは残さない
   - receiptは再作成を防ぐidempotency tombstoneとしてretention期間だけ残す
   - 削除開始前に発行されたOAuth state/Calendar callbackや進行中syncが削除完了後にauthority/dataを戻せないよう、user data generationを開始時にbindしcommit直前に再検証する。MCP applyを含むrace integrationで固定する
2. **Retention**
   - 推奨候補: success mutation receipt 90日、consumed/expired authorization code 24時間、revoked/expired access token 24時間、rotated/revoked refresh token 30日、revoked connection 90日、payload-free security event 90日
   - account削除では既存cascadeにより即時削除する
   - read tool accessを新たに監査するかを決める。初期betaではpayloadを持たないaggregate metricを推奨し、本文単位のread auditは追加しない
3. **Persistent Staging identity**
   - Product authorization server originとMCP resource originをDayopt管理下の固定HTTPS hostとして決める
   - ProductionとSupabase project/branch、OAuth connection、token、cookie、secret、client registrationを共有しない
   - 一度clientへ登録したissuer/resource URLは公開契約として変更しない

### 4. Environment-aware OAuth identityとretentionを実装する

`MCP_OAUTH_ENVIRONMENT`を`staging` / `production`の明示markerとし、CHECKPOINTで固定したexact originだけを環境変数から読む。Stagingではmarker、authorization server URI、resource URIのどれかが未設定、またはProduction値なら起動・provisionをfail closedする。Production defaultだけは現在の2 originを維持する。

DBにはservice-roleだけが設定できる環境identity singletonを置き、authorization server URIとresource URIを環境ごとに一度だけ固定する。connection/code/tokenと全grant/exchange/refresh/apply RPCはresourceをこのrowへbindする。app metadata/challengeとDB identityの不一致をreadiness checkで検出し、write gateを開かない。

同じ設定moduleから次を返す。

- canonical MCP resource
- authorization server issuer
- authorization endpoint
- token endpoint
- protected resource metadata

userinfo、query、fragment、非default port、transport pathを拒否する。Production defaultは現在の`https://mcp.dayopt.app` / `https://app.dayopt.app`を維持し、Staging値をProduction fallbackとして使わない。resource、authorization code、access token、refresh token、connectionのbindingを環境間で混ぜない。

Vercel routingは決定した2 hostだけをexact matchし、Previewのephemeral hostnameをOAuth callback/resourceとして広告しない。

retentionはservice-only cleanup RPCと定期callerを一組にし、DB時刻、bounded batch、payload-free metric、再実行可能性を持たせる。cleanup routeは既存Calendar cronのBearer照合、bounded execution、失敗観測を流用し、未認証、重複実行、backlog alertをtestする。cleanup失敗でauthorization/writeを開かない。read-only statusは件数、最古時刻、期限超過件数だけを返し、token、digest、operation ID、user ID、timeblock本文を出力しない。

### 5. Isolated Persistent Stagingをrehearseする

外部変更は対象と費用を確認した後の明示権限で行う。

1. Supabase persistent branchまたは独立projectを作る
2. Vercel staging projectと固定Product/MCP hostを作る
3. DNS、1Password master、Vercel/Supabase replica、3 clientのredirect URIを設定する
4. writeをquiesceした状態で全migrationを適用し、command版appへ切り替える
5. global/client/runtime gateを全てOFFのままread-only smokeを通す
6. 1 clientずつdurable client gate → runtime allowlist → global controlの順に開く
7. evidence matrixを通過したclientだけをbeta対象として維持する
8. 異常時はglobal controlを先に閉じ、client connectionをdisableし、最後にruntime allowlistを閉じる

Persistent Stagingで現在のmigration chain、逆GRANT、再cutoverもrehearseする。Productionへ同migration chainを自動適用しない。

### 6. 3 clientのgolden evidenceを保存する

各clientで同じtest user、同じtool schema version、別connectionを使い、次を記録する。

| Evidence                   | Pass condition                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| OAuth discovery / consent  | PKCE S256、exact callback、canonical resource、要求scopeが確認できる                        |
| Tool discovery             | effective scopeのtoolだけが列挙され、write gate閉鎖後はwrite toolが消える                   |
| Client confirmation        | client側の現在UIでwrite/modify actionの確認境界を記録する。Dayoptは確認事実を独立検証しない |
| Plan → Track → Learn       | context取得、Plan create/update、linked Record、review、next Plan updateが成立する          |
| Retry                      | response loss後の同一operation ID retryが1行/1 receiptになり、replayを返す                  |
| Parallel refresh           | clientがwinner credentialを維持し、並列応答でfamilyを誤失効または旧tokenへ巻き戻さない      |
| Reuse outside grace        | refresh familyが失効し、旧access tokenが401、再authorizationでのみ復帰する                  |
| Revoke                     | 対象connectionだけが失効し、旧access/cached call/in-flight後続transactionは変更できない     |
| UI vs MCP race             | Plan / Recordの同一時間帯createで片方だけ成功する                                           |
| External render SLA        | 最悪poll位相でCalendar、Inspector、Reviewの最終描画がtool call開始から各20秒以内            |
| Client disable / re-enable | 旧connectionのwriteは復活せず、新connectionの再authorization後だけ復帰する                  |
| Audit completeness         | 成功mutation件数とreceipt件数が一致し、payload-free statusの期限超過が0                     |
| Delete all data            | 完了後にMCP writeとCalendar syncでデータが再生成されない                                    |

repoへ保存するevidenceは、client/version、test case、開始/終了時刻、status、redacted observationだけのmanifestとする。synthetic title/note/test userを使い、raw HAR、OAuth code/token/verifier、cookie、Authorization header、callback query、service-role key、operation ID、user ID、ユーザー本文を保存しない。外部に保存する画面録画はbeta担当者だけに限定し、Step 6判定後30日以内に削除する。

client固有の現在条件も証跡へ含める。

- **ChatGPT**: 2026-07-26時点でfull MCP writeはBusiness / Enterprise / Eduのweb beta。appのtool/inputは承認時snapshotとなり、変更後はworkspace側のrefresh/re-publishが必要
- **Claude**: `claude-ai` static clientと`https://claude.ai/api/mcp/auth_callback`を使うremote custom connectorを検証する。token expiry/refresh、connector disconnect/reconnect、tool approval UIを記録する。Claude Codeのlocal callback OAuthは別clientであり、初期beta acceptanceに混ぜない
- **Cursor**: Streamable HTTP + OAuth、default tool approval、auto-runの差を記録する。実clientが提示したcallbackを毎回観測し、既定URIと異なる場合はexact env overrideへ登録する。`cursor-agent mcp login/list/list-tools`は補助証拠とし、IDEのconfirmation UXを代替しない

参考:

- [MCP Authorization 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [ChatGPT developer mode and MCP apps](https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt)
- [Claude custom connectors via remote MCP](https://support.claude.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers)
- [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)

## Reversibility Table

| Step                                      | Tag            | Rollback / roll-forward                                                                               |
| ----------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------- |
| 3 client local contract test              | [minutes]      | testとfixtureだけをrevertする。runtime contractは変えない                                             |
| env schema/example/docs                   | [minutes]      | repo変更をrevertする。外部値はまだ作らない                                                            |
| deleteAllData / retentionのcode・設定契約 | [hours]        | write gateを閉じ、forward migrationでcleanup対象または期限を狭める                                    |
| deleteAllDataによるconnection/token破棄   | [irreversible] | 削除済みcredentialは復活させず、ユーザーの明示的な再authorizationだけを許可する                       |
| Staging DB / Vercel project / secrets     | [hours]        | gateを閉じ、client connectionを失効し、固定hostを切り離す。データはbeta専用backup/retention契約に従う |
| issuer/resource/redirect URI              | [irreversible] | 登録済みclientが保存するidentityなので既存URLを改名しない。新version/new connectionへadditive移行する |
| client write gate                         | [minutes]      | globalまたはclient gateを閉じ、既存write connectionを不可逆disableする                                |
| Production migration / release            | [hours]        | このStepでは実行しない。別の明示権限とStaging済みforward planを要求する                               |

issuer/resourceはtoken audienceと保存済みclient registrationの基準になるため、任意hostnameやPreview URLを使わず、Dayopt管理下の固定originだけを採用する。

## Existing Code to Reuse

- `apps/product/src/lib/oauth-server/clients.ts` — 3 static client、exact redirect URI、runtime client allowlist
- `apps/product/src/lib/oauth-server/resource.ts` — resource URI parse/normalizeとaudience comparison
- `apps/product/src/lib/oauth-server/metadata.ts` — authorization/protected-resource metadata
- `apps/product/src/lib/oauth-server/__tests__/authorize-validation.test.ts` — PKCE、redirect、scope、resourceのunit contract
- `apps/product/src/lib/test/integration/oauth-connection.integration.test.ts` — code/refresh/revokeと3 client parallel refresh fixture
- `apps/product/src/lib/test/integration/mcp-mutation-foundation.integration.test.ts` — durable gate、receipt、revoke、retention fixture
- `apps/product/src/lib/test/integration/mcp-plan-track-learn.integration.test.ts` — actual MCP HTTPのlocal golden flow
- `apps/product/src/lib/test/integration/mcp-http-ui-race.integration.test.ts` — actual session UI対opaque-token MCP race
- `apps/product/src/app/api/mcp/_tools/registry.ts` — 18 tool descriptorとscopeの正本
- `apps/product/src/app/[locale]/(app)/(workspace)/_composition/useTimeblockRevisionSync.ts` — visible中10秒pollと復帰時再確認
- `apps/product/src/features/auth/server/user-service.ts` — SettingsのdeleteAllData adapter
- `apps/product/src/features/external-calendar/server/connection-service.ts` — provider revokeとlocal Calendar connection削除
- `apps/product/src/app/api/cron/calendar-sync/route.ts` — cron Bearer照合、bounded execution、失敗観測
- `scripts/env/schema.ts` — 1Password/env inventoryの正本
- `supabase/migrations/20260723104700_mcp_mutation_envelope_foundation.sql` — receipt retentionとcleanupの出発点
- `supabase/migrations/20260723131100_durable_mcp_client_write_control.sql` — client gateとconnection disable

## What I'm Not Doing

- Production migration、release、write gate有効化、既存token一斉失効
- Production DBまたはProduction OAuth identityをStaging testへ流用
- Dynamic Client Registration、CIMD、一般client onboarding
- 2026-07-28以降の未採用MCP revisionへの先行追随
- stateless protocol conformance suite。write betaと別scopeの[#1716](https://github.com/Dayopt/dayopt/issues/1716)へ残す
- Dayopt内proposal/approval state machine、`confirmed: true` field
- client UIの自動化でconfirmationの意味を推測すること。clientごとに現在UIを人が確認する
- read tool本文の長期audit。採用する場合も別のprivacy contractとして扱う
- external calendar write

## Completion boundary

Step 6を`done`にできるのは、次をすべて満たした時だけとする。

- 3 client共通local contract test、full integration、RLS snapshot、docs checkが通る
- customer contractのCHECKPOINTが決まり、deleteAllData後の自動再生成がintegration testで拒否される
- isolated Persistent Stagingのissuer/resource/DB/secrets/client registrationがProductionと分離されている
- 3 clientのgolden evidence matrixが全項目passする
- Calendar / Inspector / Reviewが各20秒以内に最終表示へ収束する
- success mutationとreceiptに欠損がなく、retention cleanup backlogが0
- rollback順とclient別gate閉鎖をrehearseする

この境界を満たすまで、overviewのStep 6は`pending`、Production write toolは非表示、global/client gateはOFFとする。
