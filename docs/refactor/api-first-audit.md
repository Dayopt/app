# API-first 化 audit (Step 0)

調査日: 2026-05-01（main: `52ef53d77` 時点で再 verify 済み）
調査範囲: `src/features/*/server/`
verify 方法: 全 file:line を `rg` / Read で 1 件ずつ目視確認。推測項目は明示的に分離。

---

## 用語の前置き（Dayopt の server/ 構造の実態）

CLAUDE.md / `.claude/rules/architecture.md` は「Router → Service → Supabase の3層」を
規定するが、現状の `src/features/*/server/` には **service.ts と router.ts が分離していない
file もある**。本 audit ではこれを混同しないため file ごとに layer を明記する:

| File                                       | Layer                                      |
| ------------------------------------------ | ------------------------------------------ |
| `entry/server/entry-service.ts`            | service                                    |
| `entry/server/router.ts`                   | router                                     |
| `entry/server/router-index.ts`             | barrel                                     |
| `entry/server/service-index.ts`            | barrel（factory のみ export）              |
| `entry/server/types.ts`                    | 型                                         |
| `entry/server/statistics.ts`               | **router**（tRPC procedure を直接 export） |
| `entry/server/tag-statistics.ts`           | **router**（tRPC procedure を直接 export） |
| `tags/server/tag-service.ts`               | service                                    |
| `tags/server/router.ts`                    | router                                     |
| `settings/server/billing-service.ts`       | service                                    |
| `settings/server/billing-router.ts`        | router                                     |
| `settings/server/router.ts`                | router                                     |
| `settings/server/recovery-code-actions.ts` | **Server Action**（tRPC ではない）         |
| `auth/server/user-service.ts`              | service                                    |
| `auth/server/router.ts`                    | router                                     |
| `contact/server/contact-service.ts`        | service                                    |
| `contact/server/router.ts`                 | router                                     |

`statistics.ts` / `tag-statistics.ts` を「service の歪み」として扱うのは不正確。
これらは **router file 内のロジック直書き** であり、軸 1 / 軸 2 の文脈が異なる。

### main で消えたもの（重要）

commit `52ef53d77 refactor(review): /stats 廃止 → /review 単一ページ化、バッジ削除`
にて以下が **完全削除**:

- `src/features/stats/server/badges-service.ts`
- `src/features/stats/server/badges-router.ts`
- `src/features/stats/server/badges-types.ts`
- `src/features/stats/` ディレクトリ全体（`src/features/review/` にリネーム）
- `review/` 配下には `server/` ディレクトリは存在しない（client-side hooks/lib のみ）

これにより、初回 audit で「**最大の歪み**」として識別していた
`badges-service.ts` の plan ゲート（軸 3）/ 日付整形（軸 1）/ `isProSubscriber`（軸 1-B）
は **すべて解消済み**。本 audit から削除する。

---

## 軸 1: server 層に混じってる UI format

### 1-A: 日付/時刻の文字列整形

**service 層: 検出ゼロ**（badges-service 削除により）

**router 層（service ではない）:**

- `entry/server/statistics.ts:10` — `import { formatInTimeZone } from 'date-fns-tz'`
- `entry/server/statistics.ts:22` — `getTodayInTimezone` helper（router 内 utility）
- `entry/server/statistics.ts:305` — `formatInTimeZone(new Date(), timezone, 'yyyy-MM')`
- `entry/server/statistics.ts:676` — `formatInTimeZone(since, timezone, 'yyyy-MM-dd')`（DB RPC param）
- `entry/server/statistics.ts:697` — `formatInTimeZone(d, timezone, 'yyyy-MM-dd')`

注: いずれも **DB クエリの param 用**（RPC に渡す日付文字列）または router helper であり、レスポンスとして返す UI 用文字列ではない。

### 1-B: 命名で UI 都合が見える export / return field

- `entry/server/entry-service.ts:121` — list 結果を `{ ...entry, tagId: entry.tag_id ?? null }` に変換
- `entry/server/entry-service.ts:142` — getById 結果を同パターンで変換
- 議論の余地: snake_case → camelCase 変換は **標準的な tRPC 慣行であり、UI 都合とは言い切れない**

### 1-C: HTML / markdown / className / color / icon を返してる

- `tags/server/tag-service.ts:33-46` — `transformDbTag()` が `color`, `icon` を含む Tag オブジェクトを返す。
  - **ただし `tags` テーブルに `color` / `icon` カラムが存在し、user が選択して persist するデータ**。
  - 「service が UI 用 className を生成している」のとは性質が異なる（ユーザー設定の persistence pass-through）。
  - **歪みではない**。
- HTML / markdown / className を service が組み立てる箇所は **検出ゼロ**。

### 1-D: i18n が server 層内で呼ばれてる

- 検出ゼロ。健全。

---

## 軸 2: server 層の副作用（realtime / 通知 / observability）

### 2-A: realtime channel.send / broadcast

- 検出ゼロ。健全。

### 2-B: Sentry capture

**`captureException` 呼び出し（実回数 6 件、全て router 層）:**

- `entry/server/statistics.ts:50` — `handleStatsError` 内（**router**）
- `entry/server/statistics.ts:56` — `handleStatsError` 内（**router**）
- `entry/server/tag-statistics.ts:20` — `handleTagStatsError` 内（**router**）
- `entry/server/tag-statistics.ts:26` — `handleTagStatsError` 内（**router**）
- `settings/server/billing-router.ts:76` — billing router 内（**router**）

**観察**: Sentry capture は **すべて router 層の catch ハンドラ**。service 層内に Sentry capture は **検出ゼロ**。アーキテクチャ規約と整合しており、剥がす対象ではない。

### 2-C: その他の通知 (email / push / webhook 発火)

- 検出ゼロ。

---

## 軸 3: server 層の権限 / plan ゲート

### 3-A: plan / subscription / tier の参照

**service 層:**

- `settings/server/billing-service.ts:26` — `BillingInfo.subscriptionStatus: SubscriptionStatus`（型）
- `settings/server/billing-service.ts:79` — `subscriptionStatus: (profile.subscription_status as SubscriptionStatus) ?? 'free'`（read 1 箇所目）
- `settings/server/billing-service.ts:81` — `subscriptionId: ...`（同上）
- `settings/server/billing-service.ts:294` — 同パターンの read（`getBillingOverview` 内、重複ロジック）
- `settings/server/billing-service.ts:296` — `subscriptionId`（同上）
- `settings/server/billing-service.ts:384-385` — `syncSubscriptionStatus` の DB write（webhook 経由）
- `auth/server/user-service.ts:124-156` — アカウント削除時の Stripe subscription cancel + Customer 削除（GDPR、destructor 文脈）

注: billing-service が subscription を扱うのは feature の責務そのもの。**badges-service が plan を見ていた件は削除により解消済み**。

### 3-B: profiles テーブルへの権限関連アクセス

- `settings/server/billing-service.ts:68` — billing 文脈では正常
- `settings/server/billing-service.ts:284` — `getBillingOverview` 内、同上
- `auth/server/user-service.ts:128-132` — Stripe customer id 取得（GDPR 削除文脈）

### 3-C: ctx.user の権限プロパティ参照

- service コードでは検出ゼロ。`ctx.userId` のみ使用（健全）。
- ただし test code (`entry/server/__tests__/statistics-router.test.ts:27` など) から `ctx.subscriptionStatus` の存在が判明 → `proProcedure` middleware が ctx に inject していると推測（要確認、本 audit 範囲外）。

---

## 軸 4: router ⇄ service の結合度（importer 実測）

`rg -l` で確認した実 importer:

| Service file                         | 実 importers (production code, tests 除外)                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entry/server/entry-service.ts`      | `entry/server/router.ts`（factory `createEntryService` 経由）, **`src/app/api/beacon/entry-save/route.ts`**（`new EntryService(supabase)` で直接） |
| `tags/server/tag-service.ts`         | `tags/server/router.ts` のみ（`createTagService` 経由）                                                                                            |
| `settings/server/billing-service.ts` | `settings/server/billing-router.ts`, **`src/app/api/webhooks/stripe/route.ts`**                                                                    |
| `auth/server/user-service.ts`        | `auth/server/router.ts` のみ                                                                                                                       |
| `contact/server/contact-service.ts`  | `contact/server/router.ts` のみ                                                                                                                    |

**観察**:

- `EntryService` は **既に 2 skin で使用中**（tRPC factory + REST beacon class instance）。
  - skin 間で import スタイルが異なる（factory vs class new）— signature の skin agnostic 度を見るときの注意点。
- `billing-service.syncSubscriptionStatus` は **Stripe webhook（REST）から直接呼ばれる**（`src/app/api/webhooks/stripe/route.ts:31, 249, 306, 361`）
- 残り 3 service（tags, auth, contact）は router からのみ呼ばれる（service 単位で 1:1）

method 単位での結合度（個別 procedure × method の対応関係）は本 audit では未計測。

---

## サマリ（main: `52ef53d77` 時点）

| 軸                               | 件数                                | 備考                                          |
| -------------------------------- | ----------------------------------- | --------------------------------------------- |
| 1-A 日付整形                     | service 0 / router 4                | badges 削除で service 側はゼロに              |
| 1-B UI 都合 field 命名           | 2（議論余地あり）                   | tagId 変換のみ                                |
| 1-C HTML/markdown/className 生成 | 0                                   | tag color/icon は永続データ                   |
| 1-D i18n in server               | 0                                   |                                               |
| 2-A realtime broadcast           | 0                                   |                                               |
| 2-B Sentry captureException      | 6（**全て router**、service 0）     | アーキテクチャ規約通り                        |
| 2-C email / push / webhook 発火  | 0                                   |                                               |
| 3-A plan / subscription 参照     | service 7 件（全て billing 文脈）   | badges 削除で他 feature への混入なし          |
| 3-B profiles 権限アクセス        | service 3 件（billing + auth GDPR） | badges 削除で他 feature への混入なし          |
| 3-C ctx.user 権限参照            | 0（middleware 経由は要別調査）      |                                               |
| 4 結合度                         | 5 service 中 2 つが既に複数 skin    | EntryService / billing.syncSubscriptionStatus |

---

## 残った "本物の歪み"（main 反映後）

skin agnostic 化の観点で実際に剥がす価値がある箇所:

1. **`billing-service.getBillingOverview` 内で subscription_status read が二重実装**（軸 3-A）
   - 行 79/81 と 294/296 で同じ pattern が重複
   - skin agnostic 化と独立した内部リファクタの余地
2. **`EntryService` の skin 間 import スタイル不一致**（軸 4）
   - tRPC は factory（`createEntryService`）、REST beacon は class new
   - 多 skin 化前提なら統一すべき。method の signature が両 skin で fit するか要確認
3. **`statistics.ts` / `tag-statistics.ts` が router file にロジックを直書き**（構造課題、軸とは別）
   - service 層への分離が未着手（他 feature の service/router 分離パターンと不整合）
   - 当面の API-first 化とは独立した整理対象

---

## 主な変化（前回 audit からの delta）

前回 audit（同日内、`stats` feature 健在時点）で識別していた歪みのうち、`52ef53d77` で解消済み:

- ~~軸 1-A: badges-service の `formatInTimeZone` 7 箇所~~ → **削除**
- ~~軸 1-B: `isProSubscriber` フィールド~~ → **削除**
- ~~軸 3-A: badges から profiles.subscription_status を fetch~~ → **削除**
- ~~軸 3-B: badges-service の profiles アクセス~~ → **削除**

つまり「badges feature が billing 概念を持ち込んでいる」問題は、`/stats` → `/review`
リファクタの副産物として解消されている。badges 機能そのものが production から
撤去されたため、API-first 化のために手を入れる対象ではなくなった。

---

## 残した未調査項目（本 audit の boundary）

- `proProcedure` middleware の実装と `ctx.subscriptionStatus` の inject パス
- service method × procedure の **method 単位 1:1 結合度**
- `recovery-code-actions.ts`（Server Action）の責務範囲
- `EntryService` の REST beacon 経由 method が tRPC 経由 method と同じか別か
- `statistics.ts` / `tag-statistics.ts` の service 層分離（構造リファクタ、本 audit の軸とは別件）

---

## 後続

target shape の decide は [api-shape.md](./api-shape.md) に分離。current vs target の delta もそこに集約。
