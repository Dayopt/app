---
status: current
last_verified: 2026-07-02
---

# Service 層 Contracts（skin-agnostic target shape）

作成: 2026-05-12 | 前段: [Audit](../../engineering/log/2026-05-12-service-audit.md)

Dayopt の service 層は tRPC 以外の skin（MCP server, Stripe webhook REST handler 等）からも呼ばれる。
target contract が明文化されていないと各 skin が場当たり的に service を呼び、歪みが skin の数だけ増殖する。
本文書は service 層の "正解の形" を decide し、新しい skin が contract に沿って呼べるようにする。

---

## Skin-agnostic 7 原則

| #   | 原則                                                                                                                                | Why                                                                                 | 現状                                                            |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1   | **viewer context は引数で渡す** — `userId` を string 引数で受け取る。framework ctx を service に渡さない                            | skin が違っても viewer は同じ概念。framework ctx に依存すると skin 毎に shim が要る | 全 method 準拠 ✓                                                |
| 2   | **framework object を import / touch しない** — `Request`, `NextRequest`, `NextResponse`, tRPC `Context` を service が知らない      | 一度でも触ると skin 切替時に依存が漏れる                                            | 全 service 準拠 ✓                                               |
| 3   | **error は domain typed (`ServiceError` 系列) で throw** — framework error (`TRPCError`, `NextResponse`) は router 層で wrap        | skin が error の表現を decide する責務を持つ。service は「何が起きたか」だけを表現  | 全 service 準拠 ✓                                               |
| 4   | **side effect は signature と doc に明示** — DB read/write 以外の I/O（Stripe API, GitHub API 等）は JSDoc に列挙                   | 副作用が暗黙だと skin 設計（retry / idempotency / rate limit）が組めない            | doc 化未徹底（実装は準拠）                                      |
| 5   | **時刻 / 地域依存は引数で受ける** — timezone は計算の入力として渡す。受けなければ service が DB から fetch                          | skin が timezone を知っている場合（MCP の OAuth claim 等）渡したい。fallback も維持 | write 系のみ部分準拠、read 系は service が DB fetch             |
| 6   | **pagination は contract で表明** — N 件以上ありうる method は limit / cursor / offset を持つ。全件返却を仕様とする method は明記   | skin がメモリ / レスポンスサイズの制約を予測できる                                  | 不揃い（Delta 1, 3 で対応）                                     |
| 7   | **legitimate absence と failure を区別** — 「データが無い」は null / 空配列で返してよい。「外部 API 失敗 / DB エラー」は throw する | skin の error UI と "no data" UI を別の経路で扱える                                 | BillingService 概ね準拠、`checkTimeOverlap` は要修正（Delta 2） |

### 取らないと decide したもの

- **locale**: service 引数として受けない。server 層は i18n せず raw を返す（`CLAUDE.md` と整合）。skin 側 / UI 側で format する。
- **構造統一**: class+factory / factory→object / standalone function の混在は shape の本質ではない。factory function（or 等価な構成）を export し、call site が呼びやすければよい。

---

## Per-service Target Signature

現状が target と異なる箇所は **★** で印を付け、Section "Delta" に対応 action を記載。

---

### EntryService

`src/features/entry/server/entry-service.ts` | class + factory | error: `EntryServiceError` | skins: tRPC + REST beacon

| method                  | input                                                                                                                                                                        | output                                     | error codes                                 | side effects                            | timezone                        | pagination       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- | --------------------------------------- | ------------------------------- | ---------------- |
| `list` L35              | `ListEntriesOptions { userId, tagId?, origin?, search?, startDate?, endDate?, fulfillmentScoreMin?, fulfillmentScoreMax?, sortBy, sortOrder, limit?, offset?, timezone? ★ }` | `EntryWithTags[]`                          | `FETCH_FAILED`                              | DB read                                 | optional ★（なければ DB fetch） | limit + offset ✓ |
| `getById` L128          | `{ userId, entryId }`                                                                                                                                                        | `EntryWithTags`                            | `NOT_FOUND`                                 | DB read                                 | N/A                             | N/A              |
| `checkTimeOverlap` L148 | `{ userId, startTime, endTime, excludeEntryId? }`                                                                                                                            | `string[]`（重複 entry id、空 = 重複なし） | `FETCH_FAILED` ★                            | DB read                                 | N/A                             | N/A              |
| `create` L202           | `CreateEntryOptions { userId, input, preventOverlappingEntries?, timezone? }`                                                                                                | `EntryRow`                                 | `CREATE_FAILED \| TIME_OVERLAP`             | DB write + 重複 check                   | optional ✓                      | N/A              |
| `update` L252           | `UpdateEntryOptions { userId, entryId, input, preventOverlappingEntries?, expectedUpdatedAt?, timezone? }`                                                                   | `UpdateEntryResult`                        | `UPDATE_FAILED \| CONFLICT \| TIME_OVERLAP` | DB write + 重複 check + optimistic lock | optional ✓                      | N/A              |
| `delete` L323           | `{ userId, entryId }`                                                                                                                                                        | `{ success: boolean }`                     | `DELETE_FAILED`                             | DB write（RPC soft delete）             | N/A                             | N/A              |
| `restore` L343          | `{ userId, entryId }`                                                                                                                                                        | `{ success: boolean }`                     | `RESTORE_FAILED`                            | DB write（RPC restore）                 | N/A                             | N/A              |

---

### TagService

`src/features/tags/server/tag-service.ts` | class + factory | error: `TagServiceError` | skins: tRPC のみ

**全 method pagination 不要**（Dayopt の tag 数は数十オーダー、UI も全件 render 前提）。

| method               | input                                                   | output                             | error codes                                                                                             | side effects                 |
| -------------------- | ------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `listHierarchy` L165 | `{ userId }`                                            | `TagTreeNode[]`（hierarchy、全件） | `FETCH_FAILED`                                                                                          | DB read                      |
| `list` L181          | `{ userId, sortField?, sortOrder? }`                    | `Tag[]`（flat、全件）              | —                                                                                                       | DB read                      |
| `getById` L213       | `{ userId, tagId }`                                     | `Tag`                              | `NOT_FOUND`                                                                                             | DB read                      |
| `create` L236        | `{ userId, input: CreateTagInput }`                     | `Tag`                              | `CREATE_FAILED \| DUPLICATE_NAME \| INVALID_INPUT`                                                      | DB write + parent validation |
| `update` L294        | `{ userId, tagId, updates: UpdateTagInput }`            | `Tag`                              | `UPDATE_FAILED \| DUPLICATE_NAME \| INVALID_INPUT`                                                      | DB write                     |
| `renameGroup` L387   | `{ userId, oldPrefix, newPrefix }`                      | `Tag[]`                            | `UPDATE_FAILED \| DUPLICATE_NAME`                                                                       | DB write（RPC batch）        |
| `ungroupTags` L431   | `{ userId, prefix, mergeConflicts? }`                   | `{ count, mergedCount }`           | `UPDATE_FAILED \| FETCH_FAILED \| UNGROUP_CONFLICTS \| INVALID_INPUT \| CREATE_FAILED \| DELETE_FAILED` | DB write                     |
| `deleteGroup` L562   | `{ userId, prefix, strategy?, targetTagId? }`           | `{ deletedCount }`                 | `DELETE_FAILED \| FETCH_FAILED \| INVALID_INPUT \| UPDATE_FAILED`                                       | DB write                     |
| `merge` L665         | `MergeTagsOptions { userId, sourceTagId, targetTagId }` | `MergeTagsResult`                  | `MERGE_FAILED \| SAME_TAG_MERGE \| INVALID_INPUT \| FETCH_FAILED`                                       | DB write（RPC）              |
| `delete` L730        | `{ userId, tagId, strategy?, targetTagId? }`            | `Tag`                              | `DELETE_FAILED \| FETCH_FAILED \| INVALID_INPUT \| UPDATE_FAILED`                                       | DB write                     |
| `reorder` L840       | `{ userId, updates: ReorderTagUpdate[] }`               | `{ count }`                        | `UPDATE_FAILED \| FETCH_FAILED \| INVALID_INPUT \| NOT_FOUND`                                           | DB write（RPC）              |
| `getStats` L906      | `{ userId }`                                            | `TagStatsRow[]`                    | `FETCH_FAILED`                                                                                          | DB read（RPC）               |

---

### UserService

`src/features/auth/server/user-service.ts` | factory→object | error: `UserServiceError` | skins: tRPC のみ

| method               | input                                                               | output              | error codes                                                                | side effects                                                                                                    |
| -------------------- | ------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `deleteAccount` L89  | `DeleteAccountOptions { userId, userEmail, password, confirmText }` | `{ success: true }` | `DELETE_FAILED \| DELETE_DATA_FAILED \| INVALID_INPUT \| INVALID_PASSWORD` | **Stripe API**（cancel + delete customer）, **Storage delete**, **auth.admin.deleteUser**（RLS bypass）, logger |
| `deleteBlocks` L179  | `userId: string`                                                    | `{ deletedCount }`  | `DELETE_DATA_FAILED`                                                       | DB write                                                                                                        |
| `deleteAllData` L200 | `userId: string`                                                    | `{ success: true }` | `DELETE_DATA_FAILED`                                                       | DB write（cascade）                                                                                             |
| `exportData` L237    | `ExportDataOptions { userId }`                                      | `ExportDataResult`  | `EXPORT_FAILED`                                                            | DB read（4 テーブル並列）                                                                                       |

---

### ContactService

`src/features/contact/server/contact-service.ts` | standalone function | error: `ServiceError`（base）| skins: tRPC のみ

| method                  | input                                                                        | output                      | error codes         | side effects                                                                            |
| ----------------------- | ---------------------------------------------------------------------------- | --------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| `createGitHubIssue` L43 | `CreateIssueParams { userId, userEmail, userName, input: ContactFormInput }` | `{ issueUrl, issueNumber }` | `GITHUB_API_FAILED` | **GitHub REST API**（issue 作成）, env vars `GITHUB_TOKEN` / `GITHUB_CONTACT_REPO` 読取 |

---

### BillingService

`src/features/settings/server/billing-service.ts` | standalone functions | error: `BillingServiceError` | skins: tRPC + Stripe webhook REST

| method                        | input                                                                | output                   | error codes                          | side effects                                     |
| ----------------------------- | -------------------------------------------------------------------- | ------------------------ | ------------------------------------ | ------------------------------------------------ |
| `getBillingInfo` L64          | `(supabase, userId)`                                                 | `BillingInfo`            | `FETCH_FAILED`                       | DB read                                          |
| `createCheckoutSession` L130  | `(supabase, userId, email, priceId)`                                 | `string`（Checkout URL） | `CREATE_FAILED \| UPDATE_FAILED`     | **Stripe API**（customers + checkout）, DB write |
| `createPortalSession` L171    | `(supabase, userId)`                                                 | `string`（Portal URL）   | `NOT_FOUND \| INTERNAL_SERVER_ERROR` | **Stripe API**（billingPortal）                  |
| `getPaymentMethod` L196       | `(supabase, userId)`                                                 | `PaymentMethod \| null`  | propagate（Stripe API 失敗）         | **Stripe API**                                   |
| `getInvoices` L239            | `(supabase, userId, limit?: number = 10) ★`                          | `InvoiceItem[]`          | propagate                            | **Stripe API**                                   |
| `getBillingOverview` L279     | `(supabase, userId)`                                                 | `BillingOverview`        | `FETCH_FAILED` + propagate           | DB read + **Stripe API**                         |
| `syncSubscriptionStatus` L375 | `(serviceRoleSupabase ★, stripeCustomerId, subscriptionId?, status)` | `void`                   | `UPDATE_FAILED`                      | DB write（RLS bypass 必須）                      |

`getPaymentMethod` / `getInvoices` の null / 空配列は **legitimate absence**（顧客 ID なし等）。Stripe API 失敗は throw（原則 7 準拠）。

---

## Delta（Current → Target の差分）

各 delta は後続の個別 plan で対応する。本文書は scope を decide するのみ。

### Delta 1: `EntryService.list` に optional `timezone` を追加

- **原則 5 違反**: `ListEntriesOptions`（`entry-service.ts:35`）に timezone がない
- **Target**: `timezone?: string` を追加。渡されたら使う、なければ DB fetch fallback
- 影響: breaking change なし（optional 追加）

### Delta 2: `EntryService.checkTimeOverlap` の error contract 修正

- **原則 7 違反**: `entry-service.ts:148` は DB エラー時にも空配列を返して log のみ（failure を absence と混同）
- **Target**: DB エラー時は `EntryServiceError(FETCH_FAILED)` を throw。空配列は "重複なし" の意味だけに限定
- 影響: caller（router）側 catch 追加が必要

### Delta 3: `BillingService.getInvoices` の `limit` 引数化

- **原則 6 違反**: `billing-service.ts:252` で `limit=10` ハードコード
- **Target**: `getInvoices(supabase, userId, limit?: number = 10)`
- 影響: breaking change なし（default 値で後方互換）

### Delta 4: `syncSubscriptionStatus` の RLS bypass 表明

- **原則 4 半違反**: `billing-service.ts:375` の引数名が `supabase`。コメント（`:373`）でのみ「createServiceRoleClient() 経由」と指示
- **Target**: 引数名を `serviceRoleSupabase: SupabaseClient<Database>` に rename + JSDoc 強調（`MUST be created via createServiceRoleClient() to bypass RLS`）
- 影響: 呼び出し側（`src/app/api/webhooks/stripe/route.ts:249, 306, 361`）の named arg を確認

### Delta 5: `getBillingOverview` 内の subscription_status read 重複

- 原則違反ではない（内部実装の構造課題）
- `billing-service.ts:79, 81` と `:294, 296` で同パターンの read が二重実装
- **Target**: internal helper に統合
- 注: ROI 判断で後続 plan に持ち越し可

### Delta 6: 副作用の JSDoc 明示（全 service 横断）

- **原則 4 違反**: Stripe / GitHub API を呼ぶ method の JSDoc に副作用列挙が不徹底
- 対象: `UserService.deleteAccount`, `ContactService.createGitHubIssue`, `BillingService.createCheckoutSession / createPortalSession / getPaymentMethod / getInvoices / getBillingOverview`
- **Target**: 各 method 冒頭 JSDoc に外部 I/O を列挙
- 影響: JSDoc 追加のみ、挙動変化なし

### Delta 7: 既知の構造課題（記録のみ、本 doc の対象外）

- `entry/server/statistics.ts` / `tag-statistics.ts` が router file 内にロジック直書き（service 層分離が未着手）
- `EntryService` の skin 間 import スタイル不一致（tRPC は `createEntryService` factory、REST beacon は `new EntryService(supabase)` 直接）

---

## 構造の不揃いについての判断

class+factory / factory→object / standalone function の混在は **shape の本質ではない**ため統一しない（YAGNI）。
「factory function（or 等価な構成）を export し、call site が呼びやすい signature を持つ」だけを規定する。

ContactService が standalone function でも、UserService が factory→object でも問題ない。

---

## 未決定で残す事項

- `proProcedure` middleware の `ctx.subscriptionStatus` を service が読むべきか → 現状読まないので問題なし
- method 単位の 1:1 結合度の細部 → 必要が出たときに測る
- `statistics.ts` / `tag-statistics.ts` の service 層分離 → 構造課題、shape とは別

---

## このドキュメントの使い方

1. **新しい skin（MCP / REST endpoint）を実装する時**: Section 2 の signature を contract として呼び出す。原則 1–7 に違反する形で service を呼ばない
2. **既存 method の signature を変更する時**: 変更前に原則への整合を確認する
3. **Delta を解消する時**: 各 delta を独立した plan として切る（本文書は scope decision まで）
4. **service を追加 / 削除する時**: Per-service section に entry を追加 / 削除し、原則準拠を確認する
