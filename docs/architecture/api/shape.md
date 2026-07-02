---
status: current
last_verified: 2026-07-02
---

# API Shape — Service 層の skin-agnostic contract

作成日: 2026-05-12
前段: [api-first-audit.md](../../notes/2026-05-01-api-first-audit.md)（current の歪み地図）
本文書: target shape を decide し、current → target の delta を列挙する。

---

## なぜ shape を decide するか

Dayopt の service 層は近い将来、tRPC 以外の skin（MCP server を含む）からも呼ばれる。
**target contract が明文化されていないと、各 skin が場当たり的に service を呼び、
歪みが skin の数だけ増殖する**。本文書は service 層の "正解の形" を decide して、
新しい skin（MCP / REST endpoint / 将来の何か）が contract に沿って呼べるようにする。

---

## Section 1: Skin-agnostic 7 原則

| #   | 原則                                                                                                                                          | Why                                                                                                  | 現状                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | **viewer context は引数で渡す** — `userId` を string 引数で受け取る。framework ctx を service に渡さない                                      | skin が違っても viewer は同じ概念。framework ctx に依存すると skin 毎に shim が要る                  | 全 method 準拠 ✓                                                                        |
| 2   | **framework object を import / touch しない** — `Request`, `NextRequest`, `NextResponse`, tRPC `Context` を service が知らない                | 上記の必然。一度でも触ると skin 切替時に依存が漏れる                                                 | 全 service 準拠 ✓                                                                       |
| 3   | **error は domain typed (`ServiceError` 系列) で throw** — framework error (`TRPCError`, `NextResponse`) は router 層で wrap                  | skin が error の表現を decide する責務を持つ。service は「何が起きたか」だけを表現                   | 全 service 準拠 ✓                                                                       |
| 4   | **side effect は signature と doc に明示** — DB read/write 以外の I/O（Stripe API, GitHub API 等）は JSDoc に列挙                             | 副作用が暗黙だと skin 設計（retry / idempotency / rate limit）が組めない                             | doc 化未徹底（実装は準拠）                                                              |
| 5   | **時刻 / 地域依存は引数で受ける** — timezone は計算の入力として渡す。受けなければ service が DB から fetch                                    | skin が timezone を知っている場合（MCP の OAuth claim 等）渡したい。skin agnostic な fallback も維持 | write 系のみ部分準拠、read 系は service が DB fetch                                     |
| 6   | **pagination は contract で表明** — 結果が "N 件以上ありうる" method は limit / cursor / offset を持つ。"全件取得" を仕様とする method は明記 | skin がメモリ / レスポンスサイズの制約を予測できる                                                   | 不揃い（後述 delta）                                                                    |
| 7   | **legitimate absence と failure を区別** — 「データが無い」は null / 空配列で返してよい。「外部 API 失敗 / DB エラー」は throw する           | skin の error UI と "no data" UI を別の経路で扱える                                                  | BillingService が概ね準拠、明文化なし。`EntryService.checkTimeOverlap` は要修正（後述） |

### Section 1 補足: 取らないと decide したもの

- **locale**: service 引数として受けない。server 層は i18n せず raw を返す（CLAUDE.md / code-style.md と整合）。skin 側 / UI 側で format する。
- **構造統一**: class+factory / factory→object / standalone function の混在は shape の本質ではない。`factory function を export し、call site が呼びやすければよい` とだけ規定する。ContactService が standalone function でも、UserService が factory→object でもよい。

---

## Section 2: Per-service target signature

各 method の target shape を明記する。current が target と異なる箇所は **★** で印を付け、Section 3 の delta で対応 action を書く。

---

### EntryService

- file: `src/features/entry/server/entry-service.ts`
- 構造: `class EntryService` + `createEntryService(supabase)` factory
- error: `EntryServiceError extends ServiceError`
- skins: tRPC (`createEntryService` 経由) + REST beacon (`new EntryService(supabase)` 直接)

#### `list(options)` — L35

- input: `ListEntriesOptions { userId, tagId?, origin?, search?, startDate?, endDate?, fulfillmentScoreMin?, fulfillmentScoreMax?, sortBy, sortOrder, limit?, offset?, timezone? ★ }`
- output: `Promise<EntryWithTags[]>`
- error: `EntryServiceError(FETCH_FAILED)`
- side effect: DB read
- timezone: optional, なければ DB fetch ★
- pagination: limit + offset ✓

#### `getById(options)` — L128

- input: `GetEntryByIdOptions { userId, entryId }`
- output: `Promise<EntryWithTags>`
- error: `EntryServiceError(NOT_FOUND)`
- side effect: DB read
- pagination: N/A

#### `checkTimeOverlap(options)` — L148

- input: `{ userId, startTime, endTime, excludeEntryId? }`
- output: `Promise<string[]>`（重複する entry id 配列、空配列は "重複なし"）
- error: `EntryServiceError(FETCH_FAILED)` ★（現状 error 時に空配列を返して log のみ、原則 7 違反）
- side effect: DB read
- pagination: N/A

#### `create(options)` — L202

- input: `CreateEntryOptions { userId, input, preventOverlappingEntries?, timezone? }`
- output: `Promise<EntryRow>`
- error: `EntryServiceError(CREATE_FAILED | TIME_OVERLAP)`
- side effect: DB write + 重複 check
- timezone: optional ✓

#### `update(options)` — L252

- input: `UpdateEntryOptions { userId, entryId, input, preventOverlappingEntries?, expectedUpdatedAt?, timezone? }`
- output: `Promise<UpdateEntryResult>`
- error: `EntryServiceError(UPDATE_FAILED | CONFLICT | TIME_OVERLAP)`
- side effect: DB write + 重複 check + optimistic lock
- timezone: optional ✓

#### `delete(options)` — L323

- input: `DeleteEntryOptions { userId, entryId }`
- output: `Promise<{ success: boolean }>`
- error: `EntryServiceError(DELETE_FAILED)`
- side effect: DB write（RPC 経由の soft delete）

#### `restore(options)` — L343

- input: `DeleteEntryOptions { userId, entryId }`
- output: `Promise<{ success: boolean }>`
- error: `EntryServiceError(RESTORE_FAILED)`
- side effect: DB write（RPC 経由 restore）

---

### TagService

- file: `src/features/tags/server/tag-service.ts`
- 構造: `class TagService` + `createTagService(supabase)` factory
- error: `TagServiceError extends ServiceError`
- skins: tRPC のみ
- **pagination 全 method 不要**（Dayopt の tag 数は数十オーダー、UI も全件 render 前提）。"全件返却" を仕様として明記。

#### `listHierarchy(options)` — L165

- input: `{ userId }`
- output: `Promise<TagTreeNode[]>`（hierarchy tree、全件）
- error: `TagServiceError(FETCH_FAILED)`
- pagination: N/A（全件仕様）

#### `list(options)` — L181

- input: `ListTagsOptions { userId, sortField?, sortOrder? }`
- output: `Promise<Tag[]>`（flat list、全件）
- pagination: N/A（全件仕様）

#### `getById(options)` — L213

- input: `{ userId, tagId }` → `Promise<Tag>` / `TagServiceError(NOT_FOUND)`

#### `create(options)` — L236

- input: `{ userId, input: CreateTagInput { name, color?, icon?, parentId? } }`
- output: `Promise<Tag>`
- error: `TagServiceError(CREATE_FAILED | DUPLICATE_NAME | INVALID_INPUT)`
- side effect: DB write + parent validation

#### `update(options)` — L294

- input: `{ userId, tagId, updates: UpdateTagInput }`
- output: `Promise<Tag>`
- error: `TagServiceError(UPDATE_FAILED | DUPLICATE_NAME | INVALID_INPUT)`

#### `renameGroup(options)` — L387

- input: `{ userId, oldPrefix, newPrefix }` → `Promise<Tag[]>` / `TagServiceError(UPDATE_FAILED | DUPLICATE_NAME)`
- side effect: DB write（RPC batch rename）

#### `ungroupTags(options)` — L431

- input: `{ userId, prefix, mergeConflicts? }`
- output: `Promise<{ count, mergedCount }>`
- error: `TagServiceError(UPDATE_FAILED | FETCH_FAILED | UNGROUP_CONFLICTS | INVALID_INPUT | CREATE_FAILED | DELETE_FAILED)`

#### `deleteGroup(options)` — L562

- input: `{ userId, prefix, strategy?, targetTagId? }`
- output: `Promise<{ deletedCount }>`
- error: `TagServiceError(DELETE_FAILED | FETCH_FAILED | INVALID_INPUT | UPDATE_FAILED)`

#### `merge(options)` — L665

- input: `MergeTagsOptions { userId, sourceTagId, targetTagId }`
- output: `Promise<MergeTagsResult { success, mergedAssociations, targetTag }>`
- error: `TagServiceError(MERGE_FAILED | SAME_TAG_MERGE | INVALID_INPUT | FETCH_FAILED)`
- side effect: DB write（RPC `merge_tags_with_hierarchy`）

#### `delete(options)` — L730

- input: `{ userId, tagId, strategy?, targetTagId? }`
- output: `Promise<Tag>`
- error: `TagServiceError(DELETE_FAILED | FETCH_FAILED | INVALID_INPUT | UPDATE_FAILED)`

#### `reorder(options)` — L840

- input: `{ userId, updates: ReorderTagUpdate[] }`
- output: `Promise<{ count }>`
- error: `TagServiceError(UPDATE_FAILED | FETCH_FAILED | INVALID_INPUT | NOT_FOUND)`
- side effect: DB write（RPC `batch_reorder_tags_hierarchy`）

#### `getStats(options)` — L906

- input: `{ userId }` → `Promise<TagStatsRow[]>` / `TagServiceError(FETCH_FAILED)`
- side effect: DB read（RPC `get_tag_stats`）

---

### UserService

- file: `src/features/auth/server/user-service.ts`
- 構造: `createUserService(supabase)` factory が object を返す
- error: `UserServiceError extends ServiceError`
- skins: tRPC のみ

#### `deleteAccount(options)` — L89

- input: `DeleteAccountOptions { userId, userEmail, password, confirmText }`
- output: `Promise<{ success: true }>`
- error: `UserServiceError(DELETE_FAILED | DELETE_DATA_FAILED | INVALID_INPUT | INVALID_PASSWORD)`
- side effect: **Stripe API (cancel subscriptions + delete customer)**, **Storage delete (avatars)**, **Supabase auth.admin.deleteUser** (RLS bypass via内部 `createServiceRoleClient()`), logger
- 注: 原則 4 該当。JSDoc に副作用を明記する。

#### `deleteBlocks(userId)` — L179

- input: `userId: string`
- output: `Promise<{ deletedCount }>`
- error: `UserServiceError(DELETE_DATA_FAILED)`

#### `deleteAllData(userId)` — L200

- input: `userId: string`
- output: `Promise<{ success: true }>`
- error: `UserServiceError(DELETE_DATA_FAILED)`
- side effect: DB write（entries → tags → settings の cascade delete）

#### `exportData(options)` — L237

- input: `ExportDataOptions { userId }`
- output: `Promise<ExportDataResult { exportedAt, userId, data: { profile, entries, tags, userSettings } }>`
- error: `UserServiceError(EXPORT_FAILED)`
- side effect: DB read（4 テーブル並列 fetch）

---

### ContactService

- file: `src/features/contact/server/contact-service.ts`
- 構造: standalone function（class / factory なし）
- error: `ServiceError`（base、subclass なし）
- skins: tRPC のみ

#### `createGitHubIssue(params)` — L43

- input: `CreateIssueParams { userId, userEmail, userName, input: ContactFormInput }`
- output: `Promise<CreateIssueResult { issueUrl, issueNumber }>`
- error: `ServiceError(GITHUB_API_FAILED)`
- side effect: **GitHub REST API**（issue 作成）, env vars `GITHUB_TOKEN` / `GITHUB_CONTACT_REPO` 読取
- 注: 原則 4 該当。JSDoc に副作用を明記する。

---

### BillingService

- file: `src/features/settings/server/billing-service.ts`
- 構造: standalone functions（Supabase / Stripe を引数で受ける）
- error: `BillingServiceError extends ServiceError`
- skins: tRPC (`billing-router.ts`) + REST (`src/app/api/webhooks/stripe/route.ts`)

#### `getBillingInfo(supabase, userId)` — L64

- output: `Promise<BillingInfo { subscriptionStatus, stripeCustomerId, subscriptionId }>`
- error: `BillingServiceError(FETCH_FAILED)`
- side effect: DB read

#### `createCheckoutSession(supabase, userId, email, priceId)` — L130

- output: `Promise<string>` (Checkout session URL)
- error: `BillingServiceError(CREATE_FAILED | UPDATE_FAILED)`
- side effect: **Stripe API**（customers.create + subscriptions.list + checkout.sessions.create）, DB write (`stripe_customer_id` 更新), `getAppUrl()` で base URL 取得

#### `createPortalSession(supabase, userId)` — L171

- output: `Promise<string>` (Portal session URL)
- error: `BillingServiceError(NOT_FOUND | INTERNAL_SERVER_ERROR)`
- side effect: **Stripe API**（billingPortal.sessions.create）

#### `getPaymentMethod(supabase, userId)` — L196

- output: `Promise<PaymentMethod | null>` (null は legitimate absence: 顧客 ID なし / 顧客削除済み / default PM なし)
- error: **Stripe API 失敗は throw（明示的 catch なし、propagate）**
- side effect: **Stripe API**（customers.retrieve + paymentMethods.retrieve）
- 注: 原則 7 準拠。null は absence、throw は failure。

#### `getInvoices(supabase, userId, limit? ★)` — L239

- output: `Promise<InvoiceItem[]>` (空配列は legitimate absence: 顧客 ID なし)
- error: Stripe API 失敗は throw
- side effect: **Stripe API**（invoices.list）
- pagination: `limit` を引数化 ★（current は固定 10）

#### `getBillingOverview(supabase, userId)` — L279

- output: `Promise<BillingOverview { billingInfo, paymentMethod, invoices }>`
- error: `BillingServiceError(FETCH_FAILED)` + Stripe API 失敗は throw
- side effect: DB read + **Stripe API**（getPaymentMethodByCustomerId + getInvoicesByCustomerId を並列）
- 注: 内部で profile を 1 回だけ fetch（N+1 解消済み）。getBillingInfo / getPaymentMethod / getInvoices の subscription_status read 重複ロジックを廃止して overview に集約する余地あり（**Section 3 delta**）

#### `syncSubscriptionStatus(serviceRoleSupabase ★, stripeCustomerId, subscriptionId?, status)` — L375

- output: `Promise<void>`
- error: `BillingServiceError(UPDATE_FAILED)`
- side effect: DB write（`profiles` UPDATE by `stripe_customer_id`）
- 注: **RLS bypass 必須**。引数名を `supabase` → `serviceRoleSupabase` に rename して JSDoc で必須を強調する ★（型 branding はしない）

---

## Section 3: Current → Target Delta

7 原則のうち current が満たしていない箇所。**file:line で裏取れる事実のみ列挙**。
各 delta は後続の個別 plan で対応する。本文書は scope を decide するだけ。

### Delta 1: `EntryService.list` に optional `timezone` を追加

- 原則 5 違反: `entry-service.ts:35` の `ListEntriesOptions` に timezone がない。
- Current の挙動: service が自前で `user_settings.timezone` を fetch（要 verify、本 audit 範囲外）
- Target: `ListEntriesOptions.timezone?: string`。渡されたら使う、なければ DB fetch fallback。
- 影響: tRPC / REST beacon の caller 側で渡す/渡さないを decide。breaking change なし。

### Delta 2: `EntryService.checkTimeOverlap` の error contract 修正

- 原則 7 違反: `entry-service.ts:148` の現実装は **DB エラー時にも空配列を返して log のみ**（failure を absence と混同）。
- Target: DB エラー時は `EntryServiceError(FETCH_FAILED)` を throw。空配列は "重複なし" の意味だけに限定。
- 影響: caller が error を意識する必要が出る（router 側 catch 追加）。

### Delta 3: `BillingService.getInvoices` の pagination 表明

- 原則 6 違反: `billing-service.ts:239` で `limit=10` ハードコード（`billing-service.ts:252`）。
- Target: `getInvoices(supabase, userId, limit?: number = 10)` に signature 変更。
- 影響: 既存 caller は引数省略でそのまま動く。breaking change なし。

### Delta 4: `syncSubscriptionStatus` の RLS bypass 表明

- 原則 4 半違反: `billing-service.ts:375` の現 signature は `supabase: SupabaseClient<Database>`。コメント (`billing-service.ts:373`) で「createServiceRoleClient() 経由を使用すること（RLSバイパス）」と指示。
- Target: 引数名を `serviceRoleSupabase: SupabaseClient<Database>` に rename + JSDoc で「**MUST be created via `createServiceRoleClient()` to bypass RLS**」と強調。
- 影響: 引数名変更のみ、type は同じ。呼び出し側の named arg 使用箇所のみ修正（`src/app/api/webhooks/stripe/route.ts:249, 306, 361` を check）。

### Delta 5: `BillingService.getBillingOverview` 内の subscription_status read 重複

- 原則違反ではない（構造課題）。`billing-service.ts:79, 81` と `:294, 296` で同パターンの subscription_status / subscription_id read が二重実装。
- Target: 重複を internal helper に統合。
- 影響: 純粋に internal refactor。skin agnostic とは独立だが Section 2 で参照されるため記録。
- 注: 本 delta は **shape 違反ではなく内部実装の重複**。後続 plan で扱うかどうかは ROI で判断。

### Delta 6: 副作用の JSDoc 明示（全 service 横断）

- 原則 4 違反: side effect を持つ method（特に Stripe / GitHub API を呼ぶもの）の JSDoc に副作用列挙が不徹底。
- 対象（Section 2 で "★" を付けていないが原則 4 該当）:
  - `UserService.deleteAccount` — Stripe + Storage + Auth admin + RLS bypass
  - `ContactService.createGitHubIssue` — GitHub REST API + env vars
  - `BillingService.createCheckoutSession` / `createPortalSession` — Stripe API
  - `BillingService.getPaymentMethod` / `getInvoices` / `getBillingOverview` — Stripe API
- Target: 各 method の JSDoc 冒頭に `@sideEffect` 形式（or 自然文）で外部 I/O を列挙。
- 影響: JSDoc 追加のみ、コード挙動変化なし。

### Delta 7: shape 違反ではない既知の構造課題（記録のみ）

本 plan の対象外。後続 plan で別途扱う:

- `entry/server/statistics.ts` / `tag-statistics.ts` が router file 内にロジック直書き（service 層分離が未着手）
- `EntryService` の skin 間 import スタイル不一致（tRPC は factory `createEntryService`、REST beacon は `new EntryService(supabase)` 直接呼び）

---

## Section 4: 構造の不揃いについての判断

class+factory / factory→object / standalone function の混在は **shape の本質ではない**
ため統一しない（YAGNI）。

- ContactService が standalone function でもよい
- UserService が factory→object でもよい
- 他 service を class 化に揃えるための refactor は本 plan の対象外

shape doc の規定は「factory function（or 等価な構成）を export し、call site が
呼びやすい signature を持つ」だけ。

---

## Section 5: 未決定で残す事項

shape の話ではなく後続 plan で扱う:

- `proProcedure` middleware の `ctx.subscriptionStatus` を service が読むべきか
  → 現状読まないので問題なし（badges 削除済み）
- method 単位の 1:1 結合度の細部
  → 必要が出たときに測る
- `statistics.ts` / `tag-statistics.ts` の service 層分離
  → 構造課題、shape とは別

---

## 参照する既存定義（再定義しない）

- `src/lib/trpc/errors.ts:16-119` — `ServiceError` 階層と code enum
- `src/features/entry/server/types.ts` — `ListEntriesOptions`, `CreateEntryOptions`, `UpdateEntryOptions`, `DeleteEntryOptions`, `GetEntryByIdOptions`, `EntryWithTags`, `EntryRow`, `UpdateEntryResult`
- `src/features/tags/server/tag-service.ts:48-` — `CreateTagInput`, `UpdateTagInput`, `ListTagsOptions`, `MergeTagsOptions`, `MergeTagsResult`, `ReorderTagUpdate`, `TagStatsRow`
- `src/features/auth/server/user-service.ts` — `DeleteAccountOptions`, `DeleteAccountResult`, `ExportDataOptions`, `ExportDataResult`
- `src/features/settings/server/billing-service.ts:18-` — `BillingInfo`, `PaymentMethod`, `InvoiceItem`, `BillingOverview`, `SubscriptionStatus`
- `src/features/contact/server/contact-service.ts` — `CreateIssueParams`, `CreateIssueResult`, `ContactFormInput`

---

## このドキュメントの使い方

1. **新しい skin（MCP / REST endpoint）を実装する時**: Section 2 の signature を contract として呼び出す。Section 1 の原則に違反する形で service を呼ばない。
2. **既存 method の signature 変更を検討する時**: Section 1 の原則に整合するか check してから変更する。
3. **Delta（Section 3）を解消する時**: 各 delta を独立した plan として切る（本文書は scope decision まで）。
4. **service の追加 / 削除時**: 本文書 Section 2 に entry を追加 / 削除する。同時に Section 1 原則準拠を確認する。
