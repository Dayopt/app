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

# Step 6 — rollout execution checklist

この文書をStep 6の唯一の実行runbookとする。[client beta verification](./step-6-client-beta.md)にある機能契約や合否条件は再定義しない。外部環境の作成、secret変更、migration適用、client登録、gate変更、データ削除、Production変更は、それぞれ対象を特定した明示承認後に行う。

2026-07-29の[一時PR Preview identityの判断](../../engineering/log/2026-07-29-mcp-ephemeral-preview-oauth-identity.md)により、Persistent Stagingは作成しない。Draft PR #1760の既存Previewは準備記録だけに使い、OAuth検証には使わない。段階PRごとに新しい空の一時Previewを作り、exact SHA、branch alias、Supabase project refを一致させる。repo内の準備完了をStep 6完了またはProduction移行許可として扱わない。

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

## PR Preview preparation

#1760の既存Previewで、Productionから分離した一時環境の作成とtest user管理まで確認した。このsectionは完了済みの準備記録であり、後続のmigration rehearsal、OAuth接続、3 client検証、Production deliveryには使わない。

### 1. Inventory

- [x] Production Supabase refが`yvglwblxrnrenfifsnje`である
- [x] PR #1760のSupabase refが`yvimluegqlcppejgribx`であり、Productionと異なる
- [x] Supabase branchが`persistent=false`、`with_data=false`、`ACTIVE_HEALTHY`である
- [x] Vercel Product Previewのbranch aliasが`product-git-codex-mcp-plan-track-learn-dayopt.vercel.app`である
- [x] PreviewのDB、Auth、API credentialがProductionから分離されている

### 2. Isolated PR Preview

- [x] #1760のexact SHA `051b59e6ab58c54c9fb84f3fc626cd2570eade38`でSupabase Preview checkが成功した
- [x] remote overrideをPR Previewのexact project refへbindした
- [x] Preview branchへProduction dataがcopyされていない
- [x] Production project、Production Auth、Production secret、DNSを変更していない
- [x] PRをReady化またはmainへmergeしていない

### 3. Closed test identity

- [x] Preview固有のAuth URLとredirect URLをbranch aliasへ固定した
- [x] public signupとemail signupを無効にした
- [x] 今後の自動seedを無効にし、Supabase branch action logで適用を確認した
- [x] repo既定の既知credentialを持つseed userを1年間banし、検証対象から外す
- [x] 専用temporary test userを1件だけ作る
- [x] Auth user 2件のうち、専用temporary test user 1件だけが有効であることをaggregateで確認する
- [x] temporary test userのcredentialを1Passwordの`Dayopt-Staging`へ保存する

既存Previewには設定変更前のseedから、既定test user 1件、Plan 39件、Record 43件が残っている。seed無効化は今後の再投入を止めるが、既存行は削除しない。既定test userはsample dataを維持するため削除せず、Previewの寿命を超える1年間banした。専用temporary test userだけがlogin可能であり、credentialはrepo、Issue、実行logへ保存しない。

このPreviewにはuserとsample dataがあり、Production向けDB identityが固定されている。identityは更新、削除、再分類しない。OAuth metadata、実client接続、Plan → Track → Learnの外部証跡は、新しい空のPreviewで別に確認する。

## Main merge boundary

Supabase GitHub integrationは`main`のmigrationをProductionへ反映する。このbranchのmigration chainには書き込み停止を必要とするprefixがあるため、検証はmain統合後ではなく、各段階PRのexact SHAと新しい一時Previewで実行する。

Draft PR #1760はintegration / rehearsal sourceとして残し、そのままReadyまたはmergeしない。exact SHA `f4fe653ca491ddc48e249dd691ed66851f65a64f`は137 commit、459 file、95 migrationを含むため、既存commitの機械的なcherry-pickはしない。`origin/main`から次の8候補をforward-onlyで作る。

1. [ ] additiveなDB expandを追加し、global/client/write gateをOFFに保つ
2. [ ] ACL cutoverの前後で動くTimeblock通常UI command appを配置する
3. [ ] retention、account削除、Webhookを含むexternal lifecycle compatibility appを配置する
4. [ ] OAuthの新しい制約とFKを`NOT VALID`で追加し、互換GRANTを維持する
5. [ ] preflightが0件であることを確認してOAuth制約を`VALIDATE CONSTRAINT`する
6. [ ] Timeblock ACLをcutoverし、旧3 RPC wrapperは旧instanceのdrainまで残す
7. [ ] MCP/OAuth appを全gate OFFのdark releaseとして配置する
8. [ ] 旧input、旧RPC、旧connectionの利用が0になった後だけdestructive cleanupを行う

`20260723131150_disable_pre_client_gate_write_connections.sql`は既存write connectionを不可逆に無効化する。対象行がある場合は自動適用せず、件数と顧客影響を確認した別の明示承認境界にする。

各PRは直前candidateのmerge commitとProduction schema versionを開始条件にし、main最新化、current-head CI、read-only Production preflightをやり直す。全系列、逆GRANT、再cutoverを同じ候補SHAの一時Previewで証明するまで開始しない。

やむを得ず一括maintenance cutoverへ変更する場合は、この標準手順の例外として顧客影響、停止方法、backup、roll-forward、監視、実行者を別途レビューし、対象と環境を指定した明示承認を取り直す。Production migration、integration設定変更、releaseはいずれの経路でも明示承認が必要である。

## Inputs for the external checkpoint

値やsecretをrepoへ記録しない。承認時は対象名とopaque referenceだけを提示する。

| Input            | Required evidence                                           |
| ---------------- | ----------------------------------------------------------- |
| Supabase         | organization、fresh Preview project ref、seed無効、region   |
| Vercel           | team、`product` project、対象branch、stable branch alias    |
| Rate limit       | Preview専用Upstash instanceの非secret識別子と費用上限       |
| Secrets          | Preview専用1Password itemとVercel/Supabase同期先            |
| OAuth clients    | client ID、現在version、clientが提示したexact callback      |
| Stripe           | test account ID、test mode、Webhook endpointの所有先        |
| Operators        | 実行者、監視者、停止判断者                                  |
| Destructive test | Preview環境、synthetic userのopaque label、削除操作、承認者 |

次の値は承認メッセージ、Issue、commit、logへ書かない。

- OAuth code、access token、refresh token、PKCE verifier
- cookie、Authorization header、callback query
- Supabase service-role key、DB password
- Stripe secret、Webhook secret
- operation ID、user ID、Customer ID
- 実ユーザーのPlan、Record、review本文

## Staged candidate manifest

段階PRごとに次をappend-only logへ保存する。値が未確定のcandidateをPreviewやProductionへ進めない。

```markdown
- candidate:
- predecessor_merge_sha:
- candidate_head_sha:
- expected_migration_terminal:
- supabase_preview_project_ref:
- vercel_deployment_id:
- stable_branch_alias:
- old_app_compatible: pass | fail
- new_app_compatible: pass | fail
- global_write_gate: "off"
- enabled_client_ids: []
- runtime_write_allowlist: ""
- reverse_grant_rehearsal: pass | fail
- recutover_rehearsal: pass | fail
- roll_forward_owner:
- verified_at:
```

各candidateは単独でmergeできる大きさにし、前段を飛ばさない。migrationの末尾だけでなく、旧appと新appの両方がそのDBで動くことを確認する。

## Ephemeral PR Preview sequence

### 1. Data-less Supabase branch

- [x] #1760のintegration source SHA `f4fe653ca491ddc48e249dd691ed66851f65a64f`とsource terminal `20260729061330`を記録する
- [ ] Productionへ切り出す各段階PRのexact SHAと期待terminalをmanifestへ固定する
- [ ] Productionと異なる新しいnon-persistent Preview branchを作る
- [ ] migrationとuser作成より前にseedとsignupを無効にする
- [ ] app、service-role writer、Git deploymentへまだ接続しない
- [ ] 各段階PRのcandidateをmanifest順に適用し、実terminalが期待値と一致する
- [ ] user、OAuth、audit、receiptが0件である
- [ ] global/client gateがOFFである
- [ ] exact branch refを再確認する
- [ ] service-role JWTにproject refがあり、Preview project refと一致することを値を出さず確認する
- [ ] service-role RPCでPreview identityを一度だけprovisionする
- [ ] getterが`preview`、同一originのstable branch alias、exact Supabase project refを返す
- [ ] identity tableへ直接権限がない
- [ ] connection、authorization code、tokenのresource FKがvalidatedである

### 2. Vercel branch and secrets

- [ ] `product` projectのstandard Previewを使う
- [ ] OAuthを有効にするbranchを1本だけ明示する
- [ ] `VERCEL_GIT_COMMIT_REF`が対象branchと完全一致する
- [ ] issuer、resource、redirect URIへ同じstable `VERCEL_BRANCH_URL`を使う
- [ ] deployment固有URLをissuer、resource、redirect URIに使わない
- [ ] Preview専用secretだけを設定する
- [ ] Preview専用Upstashを設定し、Productionとcredentialを共有しない
- [ ] Production用Sentry、Resend、Stripe live secretを流用しない
- [ ] `MCP_OAUTH_ENVIRONMENT=preview`を設定する
- [ ] authorization serverとresourceをexact originで設定する
- [ ] client redirect URIをexact allowlistで設定する
- [ ] runtime write allowlistを空に保つ

### 3. Read-only deployment

- [ ] deployment candidateのexact SHAで`pnpm test:mcp:conformance`を再実行し、suite version、spec version、expected failure ID、結果をmanifestへ記録する
- [ ] DB identity確認後にappをdeployする
- [ ] build/readinessがbranch、Supabase、DBのPreview identityを確認する
- [ ] OAuth metadataのissuer、endpoint、resourceを確認する
- [ ] credentialなしのMCP discoveryが正しい401 metadataを返す
- [ ] read scopeだけのconnectionでread toolだけが列挙される
- [ ] write toolが列挙されない
- [ ] cached write callが正規データを変更しない
- [ ] retention statusがaggregateだけを返す

### 4. Migration and rollback rehearsal

- [ ] migration terminalが最終段階PRのmanifestにある期待値と一致する
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

- [ ] 対象が承認済みPreviewであることをbranch、issuer、resource、DB identityで再確認する
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
- environment: preview
- authorization_server: https://<stable-branch-alias>
- resource: https://<stable-branch-alias>
- deployment_sha:
- db_identity: preview | https://<stable-branch-alias> | <supabase-project-ref>
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

Production credentialが混入した場合は、上記に加えてPreview appとcronを隔離する。影響credentialをrotateまたはrevokeし、Production側のtoken利用、OAuth connection、mutation、監査欠損をread-onlyで確認する。安全性を証明できるまでPreviewを再接続しない。

Production migration、release、gate変更、credential rotate/revokeはこのチェックリストの準備作業に含めない。
