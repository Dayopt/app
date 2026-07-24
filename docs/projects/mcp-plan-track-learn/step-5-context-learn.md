---
status: current
last_verified: 2026-07-24
code:
  - apps/product/src/app/api/mcp
  - apps/product/src/features/timeblock
  - apps/product/src/features/review
  - apps/product/src/features/tags
  - apps/product/src/lib/oauth-server
  - supabase/migrations
---

# Step 5 — Context and Learn

## Goal

外部AIが、本人のタグ、現在の時間制約、決定論的な予実レビューを最小権限で取得でき、外部からcommitされたPlan / Recordを表示中のCalendar / Inspector / Reviewが検知して再取得できる状態にする。

## Completion boundary

Step 5のrepo完了条件は次のとおり。

- `tags.list`、`constraints.get`、`review.get`のcandidate contractとscope境界が実装・testで固定されている
- Plan / Recordのcommitと同じtransactionでuser revisionが変わり、失敗・rollbackでは変わらない
- Calendar workspaceのvisible中だけ10秒間隔でrevisionを確認し、初回成功時と変更時にCalendar / Inspector / Reviewのqueryを再取得する
- Inspectorは外部更新でcleanなeditorを同期し、dirty draftを上書きせず、外部削除後に保存を発火しない
- context/reviewはsilent truncationや複数時点のPlan / Recordを混ぜずに返す
- local DB migration、unit / integration、RLS snapshot、MCP SDK contract、Plan → Track → Learn flowが通る

10秒pollは20秒以内の画面反映に必要なrepo側のbudgetである。実network、query、renderを含むhard SLAはPersistent Stagingで最悪位相を実測するまで確認済みとしない。Step 5のrepo完了とStep 6の3 client / Staging検証を分けて報告する。

全write gateはOFFのまま維持する。このStepではPreview / Productionへdeployせず、3 toolもStep 6のgolden contract前に外部公開しない。

## Implementation result

2026-07-24時点で、Step 5のrepo完了条件を満たした。

- 18 toolのdescriptorと実登録集合、4 read scope、`tags.list` / `constraints.get` / `review.get`の入力・成功・error契約をtestで固定した
- actual MCP HTTP routeとlocal DBを使い、context取得、tagged Plan作成、completed PlanへRecordを紐付け、review結果から次のPlanを更新するgolden flowを通した
- 別user、deleted row、inactive tag、untagged row、期間境界を含むfixtureでowner predicateと最小projectionを検証した
- 現行ブランチだけのfresh DBへ全migrationを適用し、migration一致とRLS snapshot一致を確認した
- local integrationは15 files / 207 testsを通した

Persistent StagingのChatGPT / Claude / Cursor、実network / render込み20秒SLA、client別write gateと運用契約はStep 6へ残す。Preview / Productionへのdeployとgate有効化は行っていない。

## Candidate public contracts

共通契約:

- inputはZodのstrict objectとし、unknown fieldを受理しない
- 日時はoffset付きISO 8601とする
- successは`schemaVersion: 1`のstructured contentを返す
- handlerが返すerrorは既存の`schemaVersion`、stable `code` / `message` / `retryable`を持つJSON text + `isError: true`とし、structured contentを付けない
- unknown field、不正な日時、逆転期間、31日超過はtool handlerを実行せず、MCP SDK生成の`CallToolResult { isError: true }`として返す。handlerのstable JSON text errorとは混ぜない
- tool registration、scope preflight、handler内scope確認、OAuth tRPC procedure pathをexact nameで一致させる

### `tags.list`

Required scope: `read:tags`

Input:

```json
{}
```

Success:

```json
{
  "schemaVersion": 1,
  "count": 2,
  "tags": [
    {
      "id": "uuid",
      "name": "Work",
      "color": "blue",
      "icon": "briefcase",
      "parentId": null,
      "sortOrder": 0
    }
  ]
}
```

Field contract:

- 本人所有かつ`is_active = true`のtagだけを返す
- `TagQueryService.list`の既定順で親から子へflattenする
- `id`、`name`、nullable `color`、nullable `icon`、nullable `parentId`、integer `sortOrder`以外を返さない
- `user_id`、active flag、created / updated timestampを返さない

Handler errors:

| Code                 | Retryable | Meaning                                     |
| -------------------- | --------- | ------------------------------------------- |
| `INSUFFICIENT_SCOPE` | false     | connectionに`read:tags`がない               |
| `READ_FAILED`        | true      | tag queryが一時的または未知の理由で失敗した |

### `constraints.get`

Required scope: `read:constraints`

Input:

```json
{
  "startDate": "2026-07-20T00:00:00+09:00",
  "endDate": "2026-07-27T00:00:00+09:00"
}
```

Input contract:

- `startDate < endDate`
- exact durationは最大`31 * 24 hours`
- DST上のcalendar day数ではなく、二つのinstant間のdurationで上限を判定する

Success:

```json
{
  "schemaVersion": 1,
  "asOf": "2026-07-24T10:00:00.000Z",
  "timezone": "Asia/Tokyo",
  "range": {
    "startDate": "2026-07-20T00:00:00+09:00",
    "endDate": "2026-07-27T00:00:00+09:00",
    "endExclusive": true
  },
  "completeness": {
    "complete": true,
    "maxItemsPerLane": 5000
  },
  "occupancy": {
    "plans": [
      {
        "startAt": "2026-07-20T01:00:00.000Z",
        "endAt": "2026-07-20T02:00:00.000Z"
      }
    ],
    "records": []
  },
  "rules": {
    "intervalBoundary": "[)",
    "overlap": {
      "planVsPlan": "forbidden",
      "recordVsRecord": "forbidden",
      "planVsRecord": "allowed"
    },
    "plans": {
      "createEnd": "after_as_of",
      "pastPlanTimeUpdate": "forbidden",
      "pastPlanContentUpdate": "allowed",
      "timeUpdateEnd": "after_as_of",
      "skippedOccupiesLane": true
    },
    "records": {
      "createEnd": "at_or_before_as_of",
      "timeUpdateEnd": "at_or_before_as_of",
      "linkedPlan": "non_deleted_unskipped_completed"
    }
  }
}
```

Occupancy contract:

- `deleted_at IS NULL`
- `start_at < endDate AND end_at > startDate`
- PlansとRecordsを別laneとして返す
- 各laneは`startAt ASC, endAt ASC`の決定順とする
- 期間と交差するrowの完全な`startAt` / `endAt`を返し、期間境界でclipしない
- skipped PlanもPlan laneを占有する
- title、note、tag、timeblock ID、source、external provenanceを返さない
- 各laneの5,001件目を検知したら結果をtruncateせず`RANGE_TOO_DENSE`にする

`asOf`は最終consistency markerで取得したDB時刻とする。timezoneは同じmarkerで取得し、読み取り前後でrevisionとtimezoneの両方が一致した時だけ返す。

Handler errors:

| Code                 | Retryable | Meaning                                                                             |
| -------------------- | --------- | ----------------------------------------------------------------------------------- |
| `INSUFFICIENT_SCOPE` | false     | connectionに`read:constraints`がない                                                |
| `RANGE_TOO_DENSE`    | false     | 同じ状態・同じrangeの自動retryでは解消しない。rangeを狭めるか状態変更後に再実行する |
| `CONTEXT_CHANGED`    | true      | 2回のattemptで読み取り中にrevisionまたはtimezoneが変化した                          |
| `READ_FAILED`        | true      | context queryが一時的または未知の理由で失敗した                                     |

### `review.get`

Required scope: `read:stats`

Inputは`constraints.get`と同じ日時・最大期間契約を使う。

Success:

```json
{
  "schemaVersion": 1,
  "asOf": "2026-07-24T10:00:00.000Z",
  "period": {
    "startDate": "2026-07-20T00:00:00+09:00",
    "endDate": "2026-07-27T00:00:00+09:00",
    "endExclusive": true,
    "timezone": "Asia/Tokyo"
  },
  "basis": {
    "planMeaning": "budget",
    "recordMeaning": "actual",
    "rowFilter": "active_tagged_start_in_period",
    "durationBoundary": "full_row_not_clipped",
    "periodBoundary": "[)",
    "varianceConvention": "planned_minus_recorded"
  },
  "hasData": true,
  "summary": {
    "plannedMinutes": 120,
    "recordedMinutes": 90,
    "varianceMinutes": 30
  },
  "accuracy": {
    "rate": 0.75,
    "status": "fair"
  },
  "tags": [
    {
      "tagId": "uuid",
      "plannedMinutes": 120,
      "recordedMinutes": 90,
      "varianceMinutes": 30,
      "variancePercent": 25
    }
  ],
  "signals": [
    {
      "code": "plan_accuracy",
      "rate": 0.75,
      "status": "fair"
    },
    {
      "code": "largest_tag_variance",
      "tagId": "uuid",
      "direction": "recorded_less_than_planned",
      "absoluteMinutes": 30
    }
  ]
}
```

Aggregation contract:

- `deleted_at IS NULL`
- `tag_id IS NOT NULL`
- `start_at >= startDate AND start_at < endDate`
- durationはrow全体の`end_at - start_at`で計算し、期間境界でclipしない
- Planをplanned / budget、Recordをrecorded / actualとする
- untagged rowを含めない
- tag metadataは含めない。名前・色・階層が必要なclientは`tags.list`を使う
- tagごとのminutesを0.1分へ丸め、その値の合計をsummaryの0.1分精度とする
- `varianceMinutes = plannedMinutes - recordedMinutes`
- `variancePercent`は既存`computeVariance`と同じinteger percentとし、planがないtagは`null`
- accuracyは丸め後summaryから既存`deriveAccuracy`で計算し、公開rateだけを小数第4位へ丸める
- accuracy statusはrate丸め前の値に`excellent` / `good` / `fair` / `poor`の既存thresholdを適用する
- tag rowsは`max(plannedMinutes, recordedMinutes) DESC, tagId ASC`
- largest varianceは`abs(varianceMinutes) DESC, tagId ASC`で一件を選ぶ。zeroならsignalを省略する
- positive varianceは`recorded_less_than_planned`、negativeは`recorded_more_than_planned`
- signal順は`plan_accuracy`、`largest_tag_variance`
- tagged Plan / Recordが0件なら`hasData: false`、summaryは全て0、`accuracy: null`、`tags: []`、`signals: []`
- distinct tagが1,000件を超える場合は巨大な二重serialize応答を返さず`RANGE_TOO_DENSE`にする
- estimation deviation、skip / unrecorded、生成文、推測した改善案は返さない

Handler errorsは`constraints.get`と同じ4 codeを使い、scopeだけ`read:stats`とする。

## OAuth and discovery

`SUPPORTED_SCOPES`に既に存在する次の4 read scopeを一般提供scopeとしてmetadataへ広告する。

1. `read:entries`
2. `read:tags`
3. `read:constraints`
4. `read:stats`

scope parameter省略時のdefaultは`read:entries`のまま変えない。write / delete scopeは広告しない。

Exact execution mapping:

| Tool              | Required scope     | tRPC path                         |
| ----------------- | ------------------ | --------------------------------- |
| `tags.list`       | `read:tags`        | `tags.list`                       |
| `constraints.get` | `read:constraints` | `timeblockContext.getConstraints` |
| `review.get`      | `read:stats`       | `statistics.getMcpReview`         |

`tools/list`はeffective scopeを持つtoolだけを返す。cached tool callはroute preflightで403 + `WWW-Authenticate`、handler内scope確認、exact tRPC procedure mappingの三境界で拒否する。403 challengeはgate適用後のeffective scopeと当該missing scopeを維持し、write / delete時だけ必須の`read:entries`を追加する。router prefix単位のOAuth許可は作らない。

## Revision and lock contract

### Stored marker

`private.timeblock_user_revisions`に次だけを保持する。

- `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)`
- `changed_at TIMESTAMPTZ NOT NULL`

revisionは変更件数ではなくopaque invalidation tokenである。serverはdecimal stringとして返し、JavaScript numberへ変換しない。

`public.get_timeblock_context_marker_v1(p_user_id)`は次を返す。

- decimal stringのrevision。rowがまだなければ`0`
- DBの`clock_timestamp()`
- `user_settings.timezone`。rowがなければ`UTC`

このfunctionは既存のservice-role JWT guardをfunction内で実行し、`SECURITY DEFINER SET search_path = ''`、完全修飾名を使う。`PUBLIC` / `anon` / `authenticated`から全権限をrevokeし、`service_role`だけにEXECUTEを付与する。`p_user_id`はsessionまたはOAuthで検証済みのcontextからnarrow server adapterが注入し、public inputにはしない。

### Lock order

通常のAFTER triggerでcounterを更新すると、counter rowを持った後に別domain rowを待つlock-order inversionを作る。append-only sequence IDは割当順とcommit順が一致せず、後からcommitした小さいIDを`MAX`で見逃し得る。どちらも採用しない。

Supported writerは既存のuser-scoped command / compatibility / tag / purge経路に限定し、次の順に揃える。

1. global direct-write advisory lockをsharedで取得
2. transaction-localなsupported writer user IDとlock modeを設定。同じtransactionで別user・別writer modeを要求したらfail closed
3. `auth.users` parent lock
4. 既存user advisory lock
5. revision rowを作成して`FOR UPDATE`
6. domain row
7. transaction終端のdeferred revision trigger

Plan / RecordのINSERT / UPDATE / DELETEには`DEFERRABLE INITIALLY DEFERRED AFTER ROW` constraint triggerを付ける。triggerはtransaction終端で実変更のuser revisionを増やす。soft delete、restore、tag detach、bulk hard delete、FK actionをtable境界で捕捉し、rollbackではcounterを進めない。supported writerはdomain rowより前にcounterをlock済みなので、commit時に新しいlock順を作らない。

同一transactionのexclusive→shared再利用は許可する。shared→exclusive upgradeは、revision rowを待つ別shared writerとのdeadlockを作り得るため、user advisory lockを取る前に`22023`で拒否する。exclusive操作を含むcompositionは最初からexclusive commandとして開始する。

service-roleによる例外的な直接DMLはapp APIにしない。ただしmigration / test / recoveryで存在するため、Plan / RecordのBEFORE STATEMENT guardはsupported writer markerがないtransactionでglobal direct-write advisory lockをexclusive取得する。tagのdirect DELETEも`ON DELETE SET NULL`でPlan / Recordを変更し得るため同じguardに参加する。

このglobal lockにより:

- supported writer同士はsharedで並行できるが、同じuserはrevision rowで直列化する
- direct DML同士はdomain row取得前にglobal exclusiveで直列化する
- direct DMLとsupported writerはglobal shared / exclusive境界で交差しない
- direct multi-user DMLのdeferred triggerが複数revision rowを取っても、他writerと逆順lockにならない

`TRUNCATE`はrow triggerを通らないため、Plans / Recordsに対するservice-roleの`TRUNCATE`をrevokeし、catalog assertionとintegration testへ追加する。

account削除時は、既存account-delete triggerがsupported exclusive lockとrevision rowを先に取得する。`auth.users`が削除された後のPlan / Record cascade eventはcounterを再insertしない。revision row自体はaccountとcascade deleteする。`deleteAllData`ではsessionが残るためrevision rowを保持し、Plan / Record hard deleteを画面へ通知する。

## Consistent Context and Review reads

新しい集計SQL RPCは作らない。repoのarchitecture ruleに従い、business logicとaggregationはTypeScript serviceへ置く。DB RPCはrevision / DB時刻 / timezoneを同時に読むmarkerだけとする。

一回のattempt:

1. marker Aを取得する
2. service-role adapterでowner predicateと最小projectionを固定したPlan / Record queryを実行する
3. 最初のpageで同じpredicateのexact countを取得し、`start_at`とtie-break用IDで決定順にpaginationする
4. exact countの`min(count, 5,001)`へ到達する前のshort pageはcomplete扱いせずfail closedにする
5. laneごとに5,001件目を取得したらtruncateせず停止する
6. marker Bを取得する
7. `A.revision === B.revision && A.timezone === B.timezone`なら、BのDB時刻を`asOf`として結果を返す

markerが変わった場合は全queryを一度だけ最初から再試行する。二回目も変われば`CONTEXT_CHANGED`を返す。これにより、複数のPostgREST requestの途中でcommitされたPlan / Recordを一つの結果へ混ぜない。transactionがmarker Aより前から進行中でも、commitがmarker Bより後なら全queryは旧stateを読み、次回revisionで検知できる。AとBの間にcommitすればrevision差で破棄する。

Plan / Record read projection:

- constraints: `id`はpagination tie-breakにだけ使い、service外へ返さず、`start_at`, `end_at`だけを返す
- review: `id`, `tag_id`, `start_at`, `end_at`だけを取得し、`id`はpagination tie-break後に破棄する

## UI revision sync

pollerはworkspace Composition Layerに一つだけ置き、`CalendarViewClient`から呼ぶ。Calendar routeがCalendar本体、Inspector、Review panelの共通mount境界である。

- interval: 10 seconds
- `document.visibilityState !== 'visible'`ではnetwork pollを停止する
- visibleへ戻った時は直ちにrevisionをrefetchする
- revision queryは`statistics` router外の`timeblockContext.getRevision`に置く
- 最初の成功時もinvalidateし、初回baseline取得と外部変更のraceを閉じる
- 以後はrevision stringが変わった時だけinvalidateする
- invalidate対象は`utils.plans.invalidate()`、`utils.records.invalidate()`、`utils.statistics.invalidate()`
- revision router自身、tags、user settingsをglobal invalidateしない

通常UIはpollを待たない。`useTimeblockWriteMutations`と`useTimeblockRecordMutations`のsettled処理に`statistics` invalidateを追加する。

## Inspector external transition

### State definitions

`clean`:

- debounced note dirtyがない
- coalesced save queueにpending patchがない
- saveがin-flightでない
- invalid range / overlapでqueueへ送れない日時draftがない

`dirty`は上記のいずれかがtrueの状態とする。save queueは`hasPendingChanges()`と`discardPending()`を公開し、Formがlocal draftとserver snapshotの順序を判断できるようにする。

### External update

- server `updated_at`が進みFormがcleanなら、note / tag / start / endとCAS versionを新しいserver snapshotへ同期する
- dirty / pending / in-flightなら、debounceをcancelし、まだ開始していないqueueをdiscardする
- 表示中のdraftは保持する
- server versionをlocal CASへ採用せず、versionをunknownにしてwriteをfreezeする
- 既存conflict state / copyを表示する
- CAS conflict自体も同じconflicted stateへ遷移し、最新snapshotを自動取得してdraftを上書きしない
- Inspectorを閉じて再openする操作を明示的なreload境界とする

### External delete

- active Plan / Record queryは`NOT_FOUND`をretryしない
- success済みのcached targetがある場合、Formを一度unavailable stateへ遷移させる
- unavailable stateでdebounceをcancelし、未開始queueをdiscardし、unmount cleanupのnote flushを抑止する
- query / mutationのどちらが先に`NOT_FOUND`を知っても、対象list行とdetail success cacheを除去する。Plan記録を含むaction mutationも同じ境界へ接続する
- neutralな既存not-found表示へ切り替える
- in-flight requestをcancel済みと偽らない。完了結果はunavailable stateを解除せず、後続writeへ使わない
- cached `NOT_FOUND`を持つ再openではrefetch完了までFormをmountせず、外部restore済みならその成功snapshotを一度の再openで採用する

初回から対象が存在しない場合はFormをmountせず、同じneutral not-found表示を使う。

## Minimum Viable Approach

1. この設計を正本としてcommitする
2. revision schema、lock順、service-role marker、TRUNCATE boundaryをmigrationとintegration testで追加する
3. revision router、10秒poll、local statistics invalidate、Inspector transitionを実装する
4. `tags.list`と`constraints.get`をscope / SDK contract込みで実装する
5. `review.get`を既存Time P/L pure derivationの再利用とSDK contract込みで実装する
6. local MCPのPlan → Track → Learn flowを通し、overviewをrepo完了状態へ更新する

## Required tests

### Revision / DB

- Plan / Recordのcreate、update、soft delete、restore、hard deleteでrevisionが変わる
- skip、tag reassignment、Record detach、confirm-day、Settings deleteBlocks / deleteAllDataでrevisionが変わる
- MCP receipt replay、stale CAS、authority expiry、domain error、explicit rollbackではrevisionが変わらない
- supported Plan write対Record write、tag bulk対Record write、direct DML対supported writerでdeadlock / lock timeoutを作らない
- direct multi-user DMLがglobal exclusive境界で完了し、各user revisionを変える
- account deleteがrevision triggerのFK errorなく完了し、revision rowもcascade deleteする
- service-roleのPlans / Records `TRUNCATE`が失敗する
- marker functionはanon / authenticatedから実行できず、service-roleでもadapterが指定したuserのrevision / timezoneだけを返す

### Context / Review

- 0件、ちょうど5,000件、5,001件、複数pageでcomplete / errorを正しく分ける
- exact countより短いpageをsilent truncationせずfail closedにする
- reviewのdistinct tagがちょうど1,000件なら成功し、1,001件なら`RANGE_TOO_DENSE`にする
- owner、deleted、range overlap、tagged predicateとprojectionを固定する
- page中にrevisionが変われば全体を一度retryし、二回変われば`CONTEXT_CHANGED`
- timezoneが途中で変わっても同じretry契約になる
- duration、rounding、variance sign / percent、accuracy threshold、empty data、signal ordering / tie-breakを固定する

### MCP / OAuth

- runtime registryと実登録集合が18 toolで一致する
- 4 read scopeのmetadata、default scope、scope-filtered discoveryを固定する
- 3 toolのstrict input、structured success、SDK生成の`isError` validation result、stable handler errorをactual SDKで検証する
- scopeのないtoolは列挙せず、cached callは403 challengeとなる
- outputにuser ID、title、note、timeblock ID、raw DB errorを含めない

### UI

- initial revisionで一度invalidateする
- 同じrevisionではinvalidateしない
- changed revisionでplans / records / statisticsをinvalidateする
- hidden中はpollせず、visible復帰時に即時refetchする
- clean external updateはeditor値を同期する
- dirty / queued / in-flight external updateはdraftを保持しwriteをfreezeする
- external deleteはdebounce / queue / unmount flushからwriteを発火しない

### Product flow

local DBとactual MCP HTTP routeで次を通す。

1. `tags.list`と`constraints.get`
2. tagged future Planの作成
3. completed Planに紐づくRecordの作成
4. `review.get`
5. review結果を根拠に次のPlanを更新

Step 6では同じgolden flowをChatGPT / Claude / CursorとPersistent Stagingで通し、最悪位相の外部mutationからCalendar / Inspector / Reviewの最終描画まで20秒以内か実測する。

## Reversibility Table

| Change                                      | Tag            | Rollback / roll-forward                                                                                |
| ------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Step 5設計doc                               | [minutes]      | git revertで戻せる                                                                                     |
| revision table / trigger / ACL / marker RPC | [hours]        | gate OFFのままforward migrationでtrigger停止・RPC revoke可能。counterは非正規データなので残置可能      |
| poll / cache / Inspector state              | [minutes]      | code revertで止めても正規データは変えない                                                              |
| 3 tool名、input / output / error schema     | [irreversible] | client discoveryが保存し得る。Step 6 golden前はdeployせず、公開後はversioned additive changeだけにする |
| OAuth一般read scope metadata                | [irreversible] | clientがscope名を保存する。既存名だけを広告し、削除・renameしない                                      |
| tests / overview                            | [minutes]      | git revertで戻せる                                                                                     |

専用toolを採用する理由はleast privilegeである。`read:constraints`を`plans.list`へ通すとtitle / noteまで漏れる。`read:stats`へ生成文や推測signalを含めると後から意味を修正できない。3 toolは最小projection、明示basis、決定論的値だけに限定する。

## Existing Code to Reuse

- `apps/product/src/app/api/mcp/_tools/registry.ts` — descriptor、scope filtering、challenge scope merge
- `apps/product/src/lib/mcp/trpc-bridge.ts` — OAuth用tRPC caller
- `apps/product/src/lib/trpc/procedures.ts` — exact OAuth procedure scope mapping
- `apps/product/src/features/tags/server/tag-query-service.ts` — active owner tagとhierarchy順
- `packages/domain/src/review.ts` — Review UIとMCPが共有するaccuracy / variance kernel
- `apps/product/src/features/timeblock/domain/time-pl-review.ts` — 最小Plan / Record行からの決定論的review導出
- `apps/product/src/features/timeblock/server/timeblock-consistent-read.ts` — marker retry / timezone / cancellation / deadline
- `apps/product/src/features/timeblock/server/timeblock-review-client.ts` — owner固定、最小projection、exact count pagination
- `apps/product/src/features/timeblock/server/timeblock-review-service.ts` — stable readと公開review service境界
- `apps/product/src/features/timeblock/hooks/useTimeblockWriteMutations.ts` — router invalidate
- `apps/product/src/features/timeblock/hooks/useTimeblockRecordMutations.ts` — record / confirm-day invalidate
- `apps/product/src/features/timeblock/hooks/useCoalescedTimeblockSave.ts` — Inspector save queue
- `apps/product/src/features/timeblock/components/editor/TimeblockInspector.tsx` — active query / not-found shell
- `apps/product/src/features/timeblock/components/editor/TimeblockInspectorForm.tsx` — CAS / conflict / draft
- `apps/product/src/app/[locale]/(app)/(workspace)/_composition/CalendarViewClient.tsx` — cross-feature poller composition
- `apps/product/src/features/timeblock/server/timeblock-command-client.ts` — narrow service-role adapter pattern
- `supabase/migrations/20260708232500_add_time_model_tables.sql` — ownership / exclusion / FK action
- `supabase/migrations/20260722233722_timeblock_atomic_commands.sql` — temporal ruleとtyped command
- `supabase/migrations/20260723130000_serialize_timeblock_user_writes.sql`以降 — supported writerのuser lock境界
- `docs/engineering/data/db/rls-snapshot.md` — current ACL / RLS audit

## What I'm Not Doing

- Step 6、3 client Persistent Staging、Preview / Production migration、deploy、gate有効化
- Dayopt内proposal / approval
- tag write、skip / unskip、confirm-day、batch changesetのMCP tool
- Supabase Realtime、background tab polling
- 新しい勤務時間、deadline、wake / sleep constraint
- estimation direction、skip / unrecorded、生成AIのレビュー文
- generic aggregation SQL RPC、汎用service-role API
- `deleteAllData`後のMCP connection契約の決定。write gate公開前の既存CHECKPOINTとして維持する
