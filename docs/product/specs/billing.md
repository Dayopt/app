---
status: current
last_verified: 2026-07-24
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
│  billing-service.ts (Service層)                     │
│    getBillingInfo / createCheckoutSession            │
│    createPortalSession / syncSubscriptionStatus      │
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
  → api.billing.createCheckoutSession.mutate()
  → billing-service.createCheckoutSession()
    → getOrCreateCustomer(): Stripe Customer 取得/作成 → profiles に保存
    → stripe.checkout.sessions.create({
        customer, mode: 'subscription',
        trial_period_days: 7,
        success_url, cancel_url
      })
  → ブラウザを Stripe Checkout ページへリダイレクト
  → 決済完了後 → success_url (/settings/subscription?success=true)
  → Stripe が Webhook を送信 → DB更新（次セクション参照）
```

### 2. ポータルフロー（サブスク管理）

```
Proユーザー "プランを管理" クリック
  → api.billing.createPortalSession.mutate()
  → billing-service.createPortalSession()
    → stripe.billingPortal.sessions.create({ customer, return_url })
  → ブラウザを Stripe Customer Portal へリダイレクト
  → ユーザーが支払い方法変更 / プラン変更 / 解約を実行
  → 変更は Webhook 経由で DB に反映
```

### 3. Webhook イベント処理

エンドポイント: `POST /api/webhooks/stripe`

| イベント                        | 処理                                                              |
| ------------------------------- | ----------------------------------------------------------------- |
| `checkout.session.completed`    | `syncSubscriptionStatus(customerId, subscriptionId, 'active')`    |
| `customer.subscription.updated` | `mapStripeStatus()` でステータス変換 → `syncSubscriptionStatus()` |
| `customer.subscription.deleted` | `syncSubscriptionStatus(customerId, null, 'free')`                |

**セキュリティ**:

- `stripe-signature` ヘッダーを `stripe.webhooks.constructEvent()` で検証
- `createServiceRoleClient()` で RLS をバイパス（Webhook にはユーザーコンテキストがないため）

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
| `STRIPE_WEBHOOK_SECRET`           | Webhook 署名検証シークレット | サーバーサイドのみ                              |
| `NEXT_PUBLIC_STRIPE_PRO_PRICE_ID` | Pro プランの Price ID        | サーバー側 Checkout 設定値。UI 表示制御にも使用 |

**注意**: `STRIPE_SECRET_KEY` が未設定の場合、`getStripe()` は `null` を返す（graceful degradation）。課金が必須の処理では `requireStripe()` を使用し、未設定時にエラーをスローする。

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

| ファイル                                                            | 役割                                                       |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| `apps/product/src/lib/stripe/client.ts`                             | Stripe クライアント初期化（`getStripe` / `requireStripe`） |
| `apps/product/src/features/settings/server/billing-service.ts`      | 課金ビジネスロジック（Service層）                          |
| `apps/product/src/features/settings/server/billing-router.ts`       | tRPC Router（Router層）                                    |
| `apps/product/src/app/api/webhooks/stripe/route.ts`                 | Webhook エンドポイント                                     |
| `apps/product/src/lib/trpc/procedures.ts`                           | `proProcedure` 定義                                        |
| `apps/product/src/features/settings/components/BillingSettings.tsx` | 課金設定UI                                                 |
| `supabase/migrations/20260317120000_add_stripe_billing_columns.sql` | DBマイグレーション                                         |
| `packages/billing/src/pricing.ts`                                   | Free / Pro の表示価格と7日トライアル                       |
| `packages/billing/src/entitlement.ts`                               | `pro_access` entitlement                                   |
