# Service 層 Audit（現状の歪み地図）

調査日: 2026-05-01（main: `52ef53d77` 時点で verify 済み）
target shape: [Service Contracts](../architecture/api/contracts.md)

---

## 前置き: server/ 構造の実態

`.claude/rules/architecture.md` は「Router → Service → Supabase の3層」を規定するが、
現状の `src/features/*/server/` には service.ts と router.ts が分離していない file もある。

| File                                       | Layer                                              |
| ------------------------------------------ | -------------------------------------------------- |
| `entry/server/entry-service.ts`            | service                                            |
| `entry/server/router.ts`                   | router                                             |
| `entry/server/statistics.ts`               | **router**（tRPC procedure を直接 export）         |
| `entry/server/tag-statistics.ts`           | **router**（tRPC procedure を直接 export）         |
| `tags/server/tag-service.ts`               | service                                            |
| `settings/server/billing-service.ts`       | service                                            |
| `settings/server/billing-router.ts`        | router                                             |
| `auth/server/user-service.ts`              | service                                            |
| `contact/server/contact-service.ts`        | service                                            |
| `onboarding/server/router.ts`              | router（service なし、procedure 内に直接ロジック） |
| `settings/server/recovery-code-actions.ts` | **Server Action**（tRPC ではない）                 |

`statistics.ts` / `tag-statistics.ts` は「service の歪み」ではなく「router file 内のロジック直書き」。
歪みの軸と文脈が異なる（軸 1–4 ではなく別の構造課題）。

---

## 軸 1: server 層に混じってる UI format

### 1-A: 日付/時刻の文字列整形

**service 層: 検出ゼロ**

**router 層（service ではない）:**

- `entry/server/statistics.ts:10` — `import { formatInTimeZone } from 'date-fns-tz'`
- `entry/server/statistics.ts:305` — `formatInTimeZone(...)` DB RPC param 用
- `entry/server/statistics.ts:676, 697` — 同上

いずれも **DB クエリの param 用**（RPC に渡す日付文字列）。レスポンスとして返す UI 用文字列ではない。

### 1-B: 命名で UI 都合が見える export / return field

- `entry/server/entry-service.ts:121` — list 結果を `{ ...entry, tagId: entry.tag_id ?? null }` に変換
- snake_case → camelCase 変換は **標準的な tRPC 慣行であり UI 都合とは言い切れない**

### 1-C: HTML / markdown / className / color / icon を返してる

- `tags/server/tag-service.ts:33-46` — `transformDbTag()` が `color`, `icon` を含む Tag を返す
- **歪みではない**: `tags` テーブルに `color` / `icon` カラムが存在し、user が選択して persist するデータ（ユーザー設定の persistence pass-through）

### 1-D: i18n が server 層内で呼ばれてる

- 検出ゼロ。健全。

---

## 軸 2: server 層の副作用（realtime / 通知 / observability）

### 2-A: realtime channel.send / broadcast

- 検出ゼロ。健全。

### 2-B: Sentry captureException

**6 件、全て router 層:**

- `entry/server/statistics.ts:50, 56` — `handleStatsError` 内
- `entry/server/tag-statistics.ts:20, 26` — `handleTagStatsError` 内
- `onboarding/server/router.ts:119`
- `settings/server/billing-router.ts:76`

**service 層内に Sentry capture は検出ゼロ**。アーキテクチャ規約と整合。

### 2-C: その他の通知（email / push / webhook 発火）

- 検出ゼロ。

---

## 軸 3: server 層の権限 / plan ゲート

### 3-A: plan / subscription / tier の参照

**service 層（billing 文脈のみ）:**

- `settings/server/billing-service.ts:79, 81, 294, 296` — `subscription_status` / `subscription_id` read（read の重複は Delta 5）
- `settings/server/billing-service.ts:384-385` — `syncSubscriptionStatus` の DB write（webhook 経由）
- `auth/server/user-service.ts:124-156` — アカウント削除時の Stripe cancel（GDPR 文脈）

billing-service が subscription を扱うのは **feature の責務そのもの**。他 feature への混入なし。

### 3-B: profiles テーブルへの権限関連アクセス

- `settings/server/billing-service.ts:68, 284` — billing 文脈では正常
- `auth/server/user-service.ts:128-132` — Stripe customer id 取得（GDPR 削除文脈）

### 3-C: ctx.user の権限プロパティ参照

- service コードでは検出ゼロ。`ctx.userId` のみ使用（健全）。
- `proProcedure` middleware が ctx に `subscriptionStatus` を inject している（test code から判明、router 層の責務）。

---

## 軸 4: router ⇄ service の結合度

**実 importer 調査:**

| Service                              | 実 importers                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `entry/server/entry-service.ts`      | `entry/server/router.ts` + **`src/app/api/beacon/entry-save/route.ts`**（`new EntryService(supabase)` 直接） |
| `tags/server/tag-service.ts`         | `tags/server/router.ts` のみ                                                                                 |
| `settings/server/billing-service.ts` | `settings/server/billing-router.ts` + **`src/app/api/webhooks/stripe/route.ts`**                             |
| `auth/server/user-service.ts`        | `auth/server/router.ts` のみ                                                                                 |
| `contact/server/contact-service.ts`  | `contact/server/router.ts` のみ                                                                              |

**既に 5 service 中 2 つが複数 skin で使用されている**（EntryService と BillingService.syncSubscriptionStatus）。
skin 間で import スタイルが不一致（factory vs class new）— Delta 7 として記録。

---

## サマリ

| 軸                               | 件数                                | 備考                                 |
| -------------------------------- | ----------------------------------- | ------------------------------------ |
| 1-A 日付整形                     | service 0 / router 4                | badges 削除で service 側はゼロに     |
| 1-B UI 都合 field 命名           | 2（議論余地あり）                   | tagId 変換のみ                       |
| 1-C HTML/markdown/className 生成 | 0                                   | tag color/icon は永続データ          |
| 1-D i18n in server               | 0                                   |                                      |
| 2-A realtime broadcast           | 0                                   |                                      |
| 2-B Sentry captureException      | 6（全て router、service 0）         | アーキテクチャ規約通り               |
| 2-C email / push / webhook 発火  | 0                                   |                                      |
| 3-A plan / subscription 参照     | service 7 件（全て billing 文脈）   | badges 削除で他 feature への混入なし |
| 3-B profiles 権限アクセス        | service 3 件（billing + auth GDPR） |                                      |
| 3-C ctx.user 権限参照            | 0（middleware 経由は別調査）        |                                      |
| 4 結合度                         | 5 service 中 2 つが既に複数 skin    | EntryService / BillingService        |

---

## main 反映後に残った "本物の歪み"（→ Delta として対処）

1. **`EntryService.checkTimeOverlap` が DB エラー時に空配列を返す**（原則 7 違反）→ Delta 2
2. **`EntryService.list` に timezone arg がない**（原則 5 違反）→ Delta 1
3. **`BillingService.getInvoices` の limit がハードコード**（原則 6 違反）→ Delta 3
4. **`syncSubscriptionStatus` の RLS bypass が暗黙**（原則 4 半違反）→ Delta 4
5. **副作用の JSDoc 不徹底**（原則 4 違反）→ Delta 6

detail は [Service Contracts](../architecture/api/contracts.md) の Delta section を参照。

---

## 削除済みのため対象外

commit `52ef53d77`（`/stats` 廃止 → `/review` 単一ページ化）にて:

- `src/features/stats/server/badges-service.ts` — plan ゲート / 日付整形 / `isProSubscriber` を持つ "最大の歪み"
- `src/features/stats/server/badges-router.ts`
- `src/features/stats/` ディレクトリ全体

これらは audit 対象から除外済み。
