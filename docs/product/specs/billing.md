---
status: current
last_verified: 2026-07-29
public_docs:
  - faq/pricing
lp: []
---

# Stripe 課金統合

Dayoptの Stripe サブスクリプション課金システムの技術ドキュメント。

---

## 概要

| 項目           | 内容                                        |
| -------------- | ------------------------------------------- |
| プラン構成     | Free ($0) / Pro ($5/月)                     |
| 年額           | 未実装（現行 Price ID は月額のみ）          |
| トライアル     | 7日間無料                                   |
| 決済基盤       | Stripe Checkout + Customer Portal + Webhook |
| ステータス管理 | Supabase `profiles` テーブル                |

現行 entitlement は `pro_access` の1種類。Free/Pro の最終的な機能境界は [#1336](https://github.com/tanakatomoya/dayopt/issues/1336) で確定する。`BILLING_ENFORCED` の既定値は `false` で、その間 `proProcedure` は認証後にゲートせず通過する。

MCP protected resourceはこの一般flagの例外として、read / writeとも常にPro限定とする。
protected resourceの
共通入口で毎request `profiles.subscription_status`を確認し、`active` / `trialing` /
`past_due`だけを許可する。`free` / `canceled`はtool discovery前に403で拒否し、判定不能は
503へfail closedする。writeは同じDB transaction内でも再検証する。

---

## アーキテクチャ

Router → Service → Stripe/Supabase の3層構造に準拠。

```
┌─────────────────────────────────────────────────────┐
│  Client (BillingSettings)                           │
│    api.billing.getOverview.useQuery()               │
│    api.billing.createCheckoutSession.useMutation()  │
│    api.billing.createPortalSession.useMutation()    │
└──────────────────────┬──────────────────────────────┘
                       │ tRPC
┌──────────────────────▼──────────────────────────────┐
│  billing-router.ts (Router層)                       │
│    getInfo / getOverview / getPaymentMethod / getInvoices
│    createCheckoutSession / createPortalSession
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│  billing-service.ts / billing-mutation-service.ts    │
│    read + webhook / Checkout + Portal orchestration  │
└────────┬─────────────────────────┬──────────────────┘
         │                         │
┌────────▼────────┐  ┌────────────▼─────────────────┐
│  Stripe API     │  │  Supabase (profiles テーブル) │
│  - Checkout     │  │  - stripe_customer_id         │
│  - Portal       │  │  - subscription_status        │
│  - Webhook      │  │  - subscription_id            │
└─────────────────┘  └──────────────────────────────┘
```

### Webhook（別経路）

```
Stripe Event
  → POST /api/webhooks/stripe (Next.js Route Handler)
    → signature 検証 (stripe.webhooks.constructEvent)
    → syncSubscriptionStatus (Service層)
    → Supabase profiles 更新 (Service Role Client, RLSバイパス)
```

---

## データモデル

### profiles テーブル（billing カラム）

マイグレーション: `20260317120000_add_stripe_billing_columns.sql`

| カラム                | 型              | デフォルト | 説明                               |
| --------------------- | --------------- | ---------- | ---------------------------------- |
| `stripe_customer_id`  | `text UNIQUE`   | `NULL`     | Stripe Customer ID (`cus_xxx`)     |
| `subscription_status` | `text NOT NULL` | `'free'`   | サブスクリプション状態             |
| `subscription_id`     | `text UNIQUE`   | `NULL`     | Stripe Subscription ID (`sub_xxx`) |

**インデックス**: `idx_profiles_stripe_customer_id` — Webhook ハンドラでの高速検索用

**CHECK制約**: `chk_subscription_status` — 値を以下に限定

### SubscriptionStatus 型

```typescript
type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled' | 'trialing';
```

| ステータス | 意味                     | Pro機能 |
| ---------- | ------------------------ | ------- |
| `free`     | 未課金 / 完全解約後      | 不可    |
| `trialing` | 7日間トライアル中        | **可**  |
| `active`   | 有効なサブスクリプション | **可**  |
| `past_due` | 支払い遅延（リトライ中） | **可**  |
| `canceled` | 解約済み                 | 不可    |

### Stripe Status マッピング

Webhook で受け取る Stripe の `Subscription.Status` を Dayopt のステータスに変換する:

| Stripe Status                              | Dayopt Status |
| ------------------------------------------ | ------------- |
| `active`                                   | `active`      |
| `trialing`                                 | `trialing`    |
| `past_due`                                 | `past_due`    |
| `canceled`, `unpaid`, `incomplete_expired` | `canceled`    |
| `incomplete`, `paused`, その他             | `free`        |

---

## 主要フロー

### 1. チェックアウトフロー

```
ユーザー "Pro にアップグレード" クリック
  → BillingSettings.handleUpgrade()
  → client が同じ intent 用の operationId を生成
  → api.billing.createCheckoutSession.mutate({ operationId })
  → billing-mutation-service.createCheckoutSession()
    → DB claim（request digest と operationId を固定）
    → Customer が未作成なら Customer provisioning を durable start
    → email で候補を絞り、metadata または同じ idempotency key で Customer を復旧
    → profiles.stripe_customer_id を exact operation へ bind
    → Customer の全 Subscription を確認
    → live Subscription があれば open Checkout を失効して operation を終了
    → Checkout provider mutation を durable start
    → 古い open Checkout Session を expire
    → 同じ namespaced idempotency key で Checkout Session を作成・復旧
    → Session ID と短命 URL を DB で reconcile
  → ブラウザを Stripe Checkout ページへリダイレクト
  → 決済完了後 → success_url (/settings/subscription?success=true)
  → Stripe が Webhook を送信 → DB更新（次セクション参照）
```

### 2. ポータルフロー（サブスク管理）

```
Proユーザー "プランを管理" クリック
  → client が同じ intent 用の operationId を生成
  → api.billing.createPortalSession.mutate({ operationId })
  → billing-mutation-service.createPortalSession()
    → DB claim → provider mutation の durable start
    → 同じ namespaced idempotency key で Portal Session を作成・復旧
    → Session ID と短命 URL を DB で reconcile
  → ブラウザを Stripe Customer Portal へリダイレクト
  → ユーザーが支払い方法変更 / プラン変更 / 解約を実行
  → 変更は Webhook 経由で DB に反映
```

### 再送とURLの契約

- `operationId` はクライアントが intent ごとに生成する。同じ通信結果不明の手動再試行では再利用する
- operation ID は component の生存期間で保持する。reload 後の明示操作は新しい intent とする
- inputなしの旧ブラウザbundleは移行期間中だけserver-generated operation IDで受ける
- Checkout と Portal は別の operation ID を使う。同期的な二重クリックは client-side lock で拒否する
- Stripe POST の前に DB state を `provider_started` へ commit する
- Customer / Checkout / Portal は用途別の namespaced idempotency key を使う
- Provider response が不明な間だけ同じ key で再送する。DB の23時間 cutoff後は provider POST を行わない
- cutoffの5分前から新しいprovider POSTを開始しない
- redirect URL はHTTPS、Stripeの用途別host、default port、userinfoなしを必須とする
- redirect URL は監査claimと分離した private tableに保存する
- Portal URLは5分、Checkout URLは10分で失効する。残り30秒未満のURLは返さない
- URL失効後は同じ operation を再実行しない。明示的な次のクリックで新しい operation を開始する
- provider requestが再送可能な間はアカウント削除開始を拒否する
- Customer作成の応答が不明なまま23時間を過ぎた場合は、アカウント削除側がuser metadataでexact検索してprofile bindまたはabandonを完了するまで削除開始を拒否する
- アカウント削除開始後は既存URLを削除し、Checkout / Portal の作成・redirectを行わない。open Checkout SessionはCalendarやStorageより先にexpireし、最終Billing stepでも再列挙する

### 3. Webhook イベント処理

エンドポイント: `POST /api/webhooks/stripe`

| イベント                        | 処理                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | `syncSubscriptionStatus(customerId, subscriptionId, 'active')`                                                                                           |
| `customer.subscription.updated` | `mapStripeStatus()` でステータス変換 → `syncSubscriptionStatus()`                                                                                        |
| `customer.subscription.deleted` | exact Customer / subscriptionなら`canceled`へ更新。account削除中、stale subscription、削除済みaccountの短期receiptは通知なしで終端し、未知Customerは失敗 |

**セキュリティ**:

- `stripe-signature` ヘッダーを `stripe.webhooks.constructEvent()` で検証
- 署名検証後、DB更新前にconfigured API keyで同じEventとcurrent AccountをStripeから5秒上限で取得する。event ID、type、作成時刻、live/test mode、Connect account、設定済みaccount IDを照合し、Webhook secretとAPI accountの取り違えをfail closedにする。以後の業務入力には署名payloadではなく、照合済みprovider Eventを使う
- Dayoptはplatform accountのWebhookだけを扱う。Stripe Connect由来のeventは拒否し、Connect対応時はaccount contextを含む別契約を設計する
- `createServiceRoleClient()` で RLS をバイパス（Webhook にはユーザーコンテキストがないため）
- account削除のterminal receiptはCustomer IDのSHA-256、記録時刻、30日expiryだけをprivate schemaへ保持し、既存maintenance cronでbounded cleanupする。並列cleanupでlock中の期限切れ行も残件として報告する

account削除フローはgeneric operationをcommitしてからStripe subscriptionをcancelするため、そのcancel eventは`account_deleting`となり通知されない。通常の解約eventがgeneric operationより先に確定した場合は通常解約として通知する。

---

## Feature Gating

### proProcedure

`apps/product/src/lib/trpc/procedures.ts` で定義。`protectedProcedure` を拡張し、`BILLING_ENFORCED=true` のときだけ Pro プラン判定を追加する。

```typescript
export const proProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!isBillingEnforced()) return next({ ctx });
  // enforcement 有効時だけ profiles.subscription_status を確認
  const status = profile.subscription_status;
  const isProActive = status === 'active' || status === 'trialing' || status === 'past_due';

  if (!isProActive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Pro プランが必要です',
    });
  }

  return next({ ctx });
});
```

### 使い方

Pro 限定のエンドポイントでは `protectedProcedure` の代わりに `proProcedure` を使用:

```typescript
// ❌ 誰でもアクセス可能
export const myRouter = createTRPCRouter({
  proFeature: protectedProcedure.query(async ({ ctx }) => { ... }),
});

// ✅ Pro ユーザーのみ
export const myRouter = createTRPCRouter({
  proFeature: proProcedure.query(async ({ ctx }) => { ... }),
});
```

### プロシージャ階層

```
publicProcedure          ← 認証不要
  └─ protectedProcedure  ← ログイン必須
       ├─ proProcedure   ← Pro プラン必須
       └─ adminProcedure ← 管理者権限必須
```

---

## 環境変数

| 変数名                            | 用途                         | 設定場所                                        |
| --------------------------------- | ---------------------------- | ----------------------------------------------- |
| `STRIPE_SECRET_KEY`               | Stripe API シークレットキー  | サーバーサイドのみ (`src/env.ts`)               |
| `STRIPE_ACCOUNT_ID`               | 固定するStripe account ID    | `acct_...`。削除前のprovider identity照合に使用 |
| `STRIPE_LIVEMODE`                 | 固定するlive/test mode       | liveは`true`、testは`false`                     |
| `STRIPE_WEBHOOK_SECRET`           | Webhook 署名検証シークレット | サーバーサイドのみ                              |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Pro プランの Price ID        | サーバー側 Checkout 設定値。UI 表示制御にも使用 |

**注意**: `STRIPE_SECRET_KEY` が未設定の場合、`getStripe()` は `null` を返す（graceful degradation）。Stripeを使う環境では`STRIPE_SECRET_KEY`、`STRIPE_ACCOUNT_ID`、`STRIPE_LIVEMODE`をまとめて設定する。アカウント削除はAccount APIとBalance APIで両方を照合し、不一致または確認不能ならidentityを残す。

---

## ローカル開発

### Stripe CLI でのWebhookテスト

```bash
# Stripe CLI をインストール（初回のみ）
brew install stripe/stripe-cli/stripe

# ログイン
stripe login

# Webhook をローカルに転送
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# 出力される signing secret は 1Password master に保存し、
# .op-env.local の op:// 参照経由で注入する
```

### テストカード

| カード番号            | 用途           |
| --------------------- | -------------- |
| `4242 4242 4242 4242` | 成功           |
| `4000 0025 0000 3155` | 3Dセキュア認証 |
| `4000 0000 0000 9995` | 支払い失敗     |

有効期限: 任意の未来日、CVC: 任意の3桁

### Stripe Dashboard

- **テストモード**: Stripe Dashboard の左上トグルで切り替え
- **Webhook ログ**: Dashboard → Developers → Webhooks → イベント一覧でデバッグ
- **Price ID 確認**: Dashboard → Products → 該当プラン → Price ID をコピー

---

## 関連ファイル

| ファイル                                                                           | 役割                                                       |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/product/src/lib/stripe/client.ts`                                            | Stripe クライアント初期化（`getStripe` / `requireStripe`） |
| `apps/product/src/features/settings/server/billing-service.ts`                     | 課金ビジネスロジック（Service層）                          |
| `apps/product/src/features/settings/server/billing-router.ts`                      | tRPC Router（Router層）                                    |
| `apps/product/src/app/api/webhooks/stripe/route.ts`                                | Webhook エンドポイント                                     |
| `apps/product/src/app/api/webhooks/stripe/stripe-webhook-identity.ts`              | Webhook secretとAPI accountのprovider照合                  |
| `apps/product/src/lib/trpc/procedures.ts`                                          | `proProcedure` 定義                                        |
| `apps/product/src/features/settings/components/BillingSettings.tsx`                | 課金設定UI                                                 |
| `supabase/migrations/20260317120000_add_stripe_billing_columns.sql`                | DBマイグレーション                                         |
| `supabase/migrations/20260728110100_preserve_billing_webhook_terminal_receipt.sql` | account削除後Webhookの短期receipt                          |
| `supabase/migrations/20260728110200_close_billing_webhook_races.sql`               | 削除中通知抑止とcleanup残件判定                            |
| `supabase/migrations/20260728110300_remove_legacy_billing_receipt_cleanup.sql`     | count-only cleanup RPCの撤去                               |
| `packages/billing/src/pricing.ts`                                                  | Free / Pro の表示価格と7日トライアル                       |
| `packages/billing/src/entitlement.ts`                                              | `pro_access` entitlement                                   |
