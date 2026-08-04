---
status: current
last_verified: 2026-08-03
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/app/api/oauth
  - apps/product/src/features/settings
  - apps/product/src/features/timeblock
  - apps/product/src/app/api/cron/external-connection-maintenance
---

# Step 6 — Client beta verification

## Goal

ChatGPT、Claude、Cursorから、同じ公開契約でDayoptのPlan → Track → Learnを完結できることを、Productionと分離した一時Previewで確認する。その証拠が揃ったclientだけを、Productionで1 clientずつ有効にする。

## Current state

2026-08-03時点の状態は次のとおりである。

- MCP / OAuth appは候補7まで`main`へ入り、Productionへdark release済み
- global write gateはOFF、enabled clientは空
- local integrationでは3 client ID、scope filter、retry、refresh、revoke、同時書き込みを検証済み
- 実client UI、実network、実OAuth callbackを通したE2Eは未実施
- 旧経路cleanupの候補8と、現在のcandidateに対するofficial conformance再実行が未完了
- Settingsのconnection一覧 / revoke UI、client停止時の恒久失効、OAuth / receipt retentionのcomplete判定が未実装

したがって「実装済み」ではあるが「closed betaを提供できる」状態ではない。

## Customer contract

- Dayoptは、接続時にユーザーが許可したscopeのtoolだけをclientへ見せる
- AIがwrite toolを呼んだ場合、Dayoptの正規データを直接変更する
- 操作確認のUIと方針はclientが担い、Dayoptは確認済みという自己申告を要求しない
- revoke、scope喪失、entitlement喪失、期限切れ、gate停止後は古いtool listを使った呼び出しも拒否する
- client gateは閉じている間だけwrite scopeを除外する。再開時に古いconnectionを復活させないには、connection revokeまたは追加のDB commandが必要である
- 同じoperationの再送は二重作成せず、異なるpayloadへのoperation ID再利用は拒否する
- UIとAIが同じ時間帯へ同時に書いた場合、DB制約により片方だけが成功する

## Preview environment

Persistent Stagingは作らない。client betaごとに破棄可能なephemeral PR Previewを使う。

- Supabase branchはProductionと別ref、`with_data: false`、non-persistentとする
- seed、public signup、email signupを止めてからsynthetic userを作る
- Vercelはstable branch aliasをissuer、resource、redirect URIに共通利用する
- deployment固有URLをOAuth identityに使わない
- Upstash、OAuth redirect、test identityはPreview専用にする
- Productionのcookie、token、service-role key、Stripe live secret、実ユーザーデータを持ち込まない
- runtime write allowlistとDB gateは、read-only確認が終わるまで空・OFFを維持する

環境identity、branch、resource、Supabase refが一致しない場合は即座に停止する。

## Client test matrix

各clientは別connectionを使い、同じsynthetic scenarioと同じtool schemaで検証する。

| Area               | Required result                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| OAuth discovery    | issuer、resource、authorization endpoint、token endpointがPreview identityと一致する                                    |
| Consent            | client名、要求scope、resourceが正しく表示され、未許可scopeは付与されない                                                |
| Tool discovery     | granted scopeで使えるtoolだけが列挙される                                                                               |
| Plan               | constraints / tags / existing Planを読み、Planをcreate / updateできる                                                   |
| Track              | Planを参照したRecordをcreateし、必要な修正をupdateできる                                                                |
| Learn              | `review.get`でPlanとRecordの差を読み、次のPlanへ反映できる                                                              |
| Retry              | response欠落を想定した同一operation再送でreceiptがreplayされ、二重作成されない                                          |
| Parallel refresh   | 同一refresh tokenの競合時に、許容grace内の勝者を維持できる                                                              |
| Refresh reuse      | grace外のreuseでfamilyが失効し、再接続へ進める                                                                          |
| Revoke             | Settingsから対象connectionだけを失効でき、同じtoken familyが復活せず、別connectionは維持される                          |
| Authorization loss | downgrade、scope撤回、reauth期限、client停止後のcached writeを拒否する                                                  |
| UI race            | 通常UIとMCPのPlan作成、Record作成を同時実行し、重複する要求の片方だけが成功する                                         |
| UI convergence     | Calendar、Inspector、Reviewが外部変更を20秒以内に反映する                                                               |
| Retention          | OAuth code、access / refresh token、connection、receiptを含む全due flagがfalseになり、aggregate以外の機微情報を返さない |
| Delete all data    | 明示承認したsynthetic userだけを削除し、MCP / Calendarから再生成されない                                                |
| Stop control       | global / client gateで即時停止し、対象connectionを恒久revokeできる。gate再開で停止対象が復活しない                      |
| Untrusted content  | legacy textと`structuredContent`の両方で、外部由来自由文をモデルへの指示として誤採用しない                              |

## Response usability contract

AIが安全に後続操作へつなげられるよう、3 clientで次を確認する。

- Plan / Recordは安定した`id`を返し、listで得たIDをget / update / deleteへそのまま渡せる
- `startAt`、`endAt`、`createdAt`、`updatedAt`はRFC 3339のabsolute timeとしてoffsetを失わない
- ユーザーtimezoneを明示的なcontextとして扱い、serverやclient端末のtimezoneを暗黙に使わない
- Recordの`planId`から対応Planを辿れる
- `source`でDayopt内作成と外部由来を区別できる
- field名、nullability、時刻の意味が3 clientで一致する
- 永続的なroute契約がない間はstable IDをlocatorの正とし、一時的なdeep linkを公開しない
- 外部カレンダーの非公開情報を露出せず、自由テキストをuntrusted dataとして扱う

現在のpublic Plan / Record schemaは`externalCalendarEventId`を公開しない。legacy textにはuntrusted noticeとdelimiterがある一方、同じpayloadの`structuredContent`は構造化されるだけでdelimiterを持たない。各clientがどちらをモデルへ渡すかを観測し、自由文を指示として誤採用する場合は公開前にserver contractまたはclient対応を修正する。

既存fieldで満たせる項目は実装を増やさない。timezone、locator、外部eventとの対応付けが必要だと実機検証で分かった場合だけ、privacy境界を確認した最小のcontract変更を別PRで行う。

## Evidence manifest

clientごとに`docs/engineering/log/YYYY-MM-DD-mcp-beta-<client>-<run>.md`を作る。結果はappend-onlyとし、再試験は新しいrunへ分ける。

```yaml
status: frozen
date: YYYY-MM-DD
client: claude-ai | chatgpt | cursor
client_version: '<version>'
environment: preview
authorization_server: 'https://<stable-branch-alias>'
resource: 'https://<stable-branch-alias>'
deployment_sha: '<exact-sha>'
db_identity:
  environment: preview
  origin: 'https://<stable-branch-alias>'
  supabase_project_ref: '<non-secret-ref>'
gate_revision: '<opaque-revision>'
synthetic_subject_label: '<non-identifying-label>'
destructive_test_authority: '<approval-record-reference-or-none>'
started_at: 'YYYY-MM-DDTHH:MM:SSZ'
ended_at: 'YYYY-MM-DDTHH:MM:SSZ'
result: pass | fail | blocked
```

`date`はfilenameの日付と一致させる（未来日付は不可）。`status: frozen`はlogのappend-only凍結flagであり、run合否ではない。合否は`result`が持つ。

manifest本文には、test matrix各行のstatusと、HTTP status、件数、時刻、最終画面状態だけを書く。次は保存しない。

- OAuth code、access token、refresh token、PKCE verifier
- cookie、Authorization header、callback query
- service-role key、DB password、Webhook secret
- user ID、operation ID、Customer ID
- Plan、Record、reviewの本文
- raw HARや無加工の画面録画

画面録画が必要な場合はrepo外の制限された場所へ置き、Step 6判定後30日以内に削除する。

## Per-client pass condition

1 clientをpassにするには、次をすべて満たす。

- exact candidate SHAでprotocol verificationがpassしている
- matrixの全項目がpassし、blockedが残っていない
- mutation件数とreceipt件数が一致する
- DB statusが返すOAuth / receiptを含む全retention due flagがfalseである。現在のmaintenance summaryの`complete`だけでは判定しない
- client gate / global gateの一時停止と、connection revokeによる恒久停止の両方をrehearseしている
- Settingsのconnection一覧 / revokeと、structured contentのuntrusted data testがpassしている
- failure時の顧客影響と再接続手順がSettings / docsと一致する

clientは`claude-ai`、`chatgpt`、`cursor`の順序を固定しない。最初に互換性が確認できた1 clientからProduction betaへ進めるが、Project完了には3 clientすべてのpassが必要である。

## Completion boundary

- 3 clientすべてに独立したpass manifestがある
- Plan → Track → Learnが同じ公開契約で完結する
- 20秒以内のUI convergenceとnegative caseを実測している
- retention、account削除、revoke、gate停止が実環境で成立する
- Production betaの対象client、運用担当、停止判断、監視が決まっている

Production migration、release、write gate変更、credential rotate / revokeはこの文書だけでは承認されない。対象と環境を指定した明示承認を別に得る。
