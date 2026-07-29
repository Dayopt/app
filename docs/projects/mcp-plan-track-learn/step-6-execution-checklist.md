---
status: current
last_verified: 2026-07-29
code:
  - apps/product/src/app/api/health
  - apps/product/src/app/api/mcp
  - apps/product/src/lib/oauth-server
  - scripts/verify-mcp-environment-identity.sh
  - supabase/migrations
  - vercel.json
---

# Step 6 — Persistent Staging execution checklist

この文書は、[client beta verification](./step-6-client-beta.md)を実行する時のチェックリストである。機能契約や合否条件は再定義しない。外部環境の作成、secret変更、migration適用、client登録、gate変更、データ削除、Production変更は、それぞれ対象を特定した明示承認後に行う。

## Repository-only preparation

- [x] Node.js 24.xで`pnpm check`が成功する
- [x] `pnpm docs:check`が成功する
- [x] `pnpm test:mcp:conformance`がspec `2026-07-28`と固定済みexpected failureだけで成功する
- [x] `pnpm exec vitest run --config vitest.scripts.config.ts scripts/__tests__/mcp-env-schema.test.ts`が成功する
- [x] testでMCP OAuthのenv schemaとlocal 1Password reference、Stripe identityのenv schema、1Password setup、Secrets文書を確認する
- [x] Productの`.env.example`にMCP OAuthとStripe provider identityの変数名だけを追加する
- [x] rootの`.op-env.local.example`にStripe provider identityの1Password referenceを追加する
- [ ] `MCP_WRITE_ENABLED_CLIENTS`の値は空である
- [ ] DBのglobal/client gateはOFFである
- [ ] Productionへ接続するbranch、project、secret、cookie、OAuth connectionを使わない

`.env`系ファイルはagentのPreToolUseで書き込みを禁止している。上記2ファイルは値を入れず、ユーザーが手動で更新した。追加した変数名は次のとおり。

```text
OAUTH_CLAUDE_REDIRECT_URIS
OAUTH_CHATGPT_REDIRECT_URIS
OAUTH_CURSOR_REDIRECT_URIS
MCP_OAUTH_ENVIRONMENT
OAUTH_AUTHORIZATION_SERVER_URI
MCP_CANONICAL_RESOURCE_URI
MCP_WRITE_ENABLED_CLIENTS
STRIPE_ACCOUNT_ID
STRIPE_LIVEMODE
```

rootの`.op-env.local.example`には次のopaque referenceだけを追加する。

```text
STRIPE_ACCOUNT_ID=op://Dayopt-Staging/stripe-test/STRIPE_ACCOUNT_ID
STRIPE_LIVEMODE=op://Dayopt-Staging/stripe-test/STRIPE_LIVEMODE
```

Productの`.env.example`とrootの`.op-env.local.example`は自動test対象である。Product側は空の変数名、root側は許可した1Password referenceがexactly once存在することを確認する。

`pnpm test:mcp-environment-identity`はlocal DBをdata-less resetしてから既定seedへ戻す。専用local stackで、破棄してよい状態だと確認した時だけ実行する。

## Inputs for the external checkpoint

値やsecretをrepoへ記録しない。承認時は対象名とopaque referenceだけを提示する。

| Input            | Required evidence                                           |
| ---------------- | ----------------------------------------------------------- |
| Supabase         | organization、project、作成予定branch名、費用、region       |
| Vercel           | team、`product` project、Custom Environment名、費用         |
| DNS              | `staging.dayopt.app`と`mcp.staging.dayopt.app`の所有先      |
| Secrets          | Staging専用1Password itemとVercel/Supabase同期先            |
| OAuth clients    | client ID、現在version、clientが提示したexact callback      |
| Stripe           | test account ID、test mode、Webhook endpointの所有先        |
| Operators        | 実行者、監視者、停止判断者                                  |
| Destructive test | Staging環境、synthetic userのopaque label、削除操作、承認者 |

次の値は承認メッセージ、Issue、commit、logへ書かない。

- OAuth code、access token、refresh token、PKCE verifier
- cookie、Authorization header、callback query
- Supabase service-role key、DB password
- Stripe secret、Webhook secret
- operation ID、user ID、Customer ID
- 実ユーザーのPlan、Record、review本文

## Persistent Staging sequence

### 1. Data-less Supabase branch

- [ ] Productionと異なるpersistent branchを作る
- [ ] seedとsignupを無効にする
- [ ] app、service-role writer、Git deploymentへまだ接続しない
- [ ] identity migrationまで適用する
- [ ] user、OAuth、audit、receiptが0件である
- [ ] global/client gateがOFFである
- [ ] exact branch refを再確認する
- [ ] service-role RPCでStaging identityを一度だけprovisionする
- [ ] getterが`staging`、`https://staging.dayopt.app`、`https://mcp.staging.dayopt.app`を返す
- [ ] identity tableへ直接権限がない
- [ ] connection、authorization code、tokenのresource FKがvalidatedである

### 2. Vercel, DNS, and secrets

- [ ] `product` projectにCustom Environment `staging`を作る
- [ ] ProductとMCPの固定hostだけを割り当てる
- [ ] Preview hostnameをissuer、resource、redirect URIに使わない
- [ ] Staging専用secretだけを設定する
- [ ] Production用Sentry、Resend、Stripe live secretを流用しない
- [ ] `MCP_OAUTH_ENVIRONMENT=staging`を設定する
- [ ] authorization serverとresourceをexact originで設定する
- [ ] client redirect URIをexact allowlistで設定する
- [ ] runtime write allowlistを空に保つ

### 3. Read-only deployment

- [ ] deployment candidateのexact SHAで`pnpm test:mcp:conformance`を再実行し、suite version、spec version、expected failure ID、結果をmanifestへ記録する
- [ ] DB identity確認後にappをdeployする
- [ ] build/readinessがStaging identityを確認する
- [ ] OAuth metadataのissuer、endpoint、resourceを確認する
- [ ] credentialなしのMCP discoveryが正しい401 metadataを返す
- [ ] read scopeだけのconnectionでread toolだけが列挙される
- [ ] write toolが列挙されない
- [ ] cached write callが正規データを変更しない
- [ ] retention statusがaggregateだけを返す

### 4. Migration and rollback rehearsal

- [ ] OAuth writeをquiesceする
- [ ] 旧instanceをdrainする
- [ ] OAuth 3 tableのrow数とlock waiterを記録する
- [ ] migrationの開始・終了時刻と最大lock待ちを記録する
- [ ] migration間でapp writeを再開しない
- [ ] identity、3 FK、function ACLを確認する
- [ ] command版appをDB-firstでdeployする
- [ ] 最小権限の逆GRANTをrehearseする
- [ ] 新timestamp migrationによる再cutoverをrehearseする
- [ ] rollback中もwrite gateを開かない

### 5. Destructive evidence checkpoint

- [ ] 対象がPersistent Stagingであることをissuer、resource、DB identityで再確認する
- [ ] Productionと衝突しないsynthetic userのopaque labelを決める
- [ ] 対象synthetic user、環境、`deleteAllData`操作を指定した明示承認を得る
- [ ] deployment SHAとDB identity tupleを記録する
- [ ] 実ユーザーのID、メール、本文を証跡へ書かない
- [ ] 削除後のMCP writeとCalendar syncで再生成されないことだけを確認する

## Client evidence manifest

clientごとに別connection、同じsynthetic test user、同じtool schema versionを使う。結果は`docs/engineering/log/YYYY-MM-DD-mcp-beta-<client>-<run>.md`へappend-onlyで保存する。環境識別子は非secretのexact tupleだけを使い、user IDやoperation IDを使わない。

```markdown
---
status: current
last_verified: YYYY-MM-DD
code:
  - docs/projects/mcp-plan-track-learn/step-6-client-beta.md
---

# MCP beta evidence — <client> <run>

- client: claude-ai | chatgpt | cursor
- client_version:
- environment: staging
- authorization_server: https://staging.dayopt.app
- resource: https://mcp.staging.dayopt.app
- deployment_sha:
- db_identity: staging | https://staging.dayopt.app | https://mcp.staging.dayopt.app
- gate_revision:
- synthetic_subject_label:
- destructive_test_authority:
- started_at: YYYY-MM-DDTHH:MM:SSZ
- ended_at: YYYY-MM-DDTHH:MM:SSZ

| Test case                  | Status                | Redacted observation |
| -------------------------- | --------------------- | -------------------- |
| OAuth discovery / consent  | pass / fail / blocked |                      |
| Tool discovery             | pass / fail / blocked |                      |
| Client confirmation        | pass / fail / blocked |                      |
| Plan → Track → Learn       | pass / fail / blocked |                      |
| Retry                      | pass / fail / blocked |                      |
| Parallel refresh           | pass / fail / blocked |                      |
| Reuse outside grace        | pass / fail / blocked |                      |
| Revoke                     | pass / fail / blocked |                      |
| UI vs MCP race             | pass / fail / blocked |                      |
| External render SLA        | pass / fail / blocked |                      |
| Client disable / re-enable | pass / fail / blocked |                      |
| Audit completeness         | pass / fail / blocked |                      |
| Delete all data            | pass / fail / blocked |                      |
```

`destructive_test_authority`はsecretや個人情報を含まない承認記録への参照だけを置く。observationには件数、時刻、HTTP status、画面の最終状態だけを書く。raw HARやcredentialを貼らない。画面録画はrepoへ保存せず、beta担当者だけが閲覧できる場所で管理し、Step 6判定後30日以内に削除する。

## Gate opening

1 clientずつ、全項目がpassしたmanifestを確認して進める。

1. durable client gateを開く
2. runtime allowlistへclientを追加する
3. global controlを開く
4. 新しいconnectionで再authorizationする
5. evidence matrixを再実行する

旧connectionを再有効化しない。scope変更やclient再有効化では新しいconnectionを作る。

## Stop and rollback

次のいずれかでHALTする。

- issuer、resource、host、DB identityが一致しない
- Productionのsecret、cookie、token、connectionが混入した
- write gate OFFでwrite toolが列挙された
- unknown Customerや未知resourceが成功扱いになった
- mutationとreceiptの件数が一致しない
- retention cleanupに期限超過backlogがある
- Calendar、Inspector、Reviewが20秒以内に収束しない
- rollbackまたはclient disableでin-flight writeを止められない

異常時は次の順に閉じる。

1. global controlをOFFにする
2. durable client controlをOFFにし、対象clientの全write connectionを同じtransactionで不可逆disableする
3. runtime allowlistから対象clientを除く

Production credentialが混入した場合は、上記に加えてStaging appとcronを隔離する。影響credentialをrotateまたはrevokeし、Production側のtoken利用、OAuth connection、mutation、監査欠損をread-onlyで確認する。安全性を証明できるまでStagingを再接続しない。

Production migration、release、gate変更、credential rotate/revokeはこのチェックリストの準備作業に含めない。
