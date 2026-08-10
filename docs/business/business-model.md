---
status: current
last_verified: 2026-08-10
code:
  - packages/billing/src/pricing.ts
  - apps/product/src/app/api/webhooks/stripe/route.ts
---

# ビジネスモデルとコスト構造

Dayoptは個人向けFreemium subscriptionとして運営する。この文書は推測の月額表ではなく、売上・原価・運用費をどの正本から計算するかを定義する。

## Revenue model

- Free: $0
- Pro: $5 / month、初回7日trial
- Stripe Checkout / Customer Portal / webhookでsubscriptionを管理する
- 年額、team、B2B契約は現行契約にない
- current priceの正本は`packages/billing`、ユーザー向け挙動は[Billing spec](../product/specs/billing.md)

## Cost model

| 区分       | 主な要素                                                                          | 証拠の正本                   |
| ---------- | --------------------------------------------------------------------------------- | ---------------------------- |
| 固定費     | domain、1Password、契約planの最低料金                                             | invoice / provider dashboard |
| 利用量連動 | Vercel compute・bandwidth、Supabase compute・storage、Upstash request、Resend送信 | provider usage dashboard     |
| 売上連動   | Stripe決済手数料                                                                  | Stripe balance / invoice     |
| 運用費     | Sentry等のplan upgrade                                                            | provider invoice             |

契約サービスの用途と所有関係は[company/accounts.md](../company/accounts.md)を正とする。金額は契約・usageで変動するため、根拠となるinvoiceなしにこの文書へ固定値を複製しない。

## 明示的に含めない原価

- in-app AI / LLM API: 提供していない。外部AIはユーザー側のMCP / API clientから利用する
- OSS library: SaaS契約費ではない。licenseは別途管理する

`ANTHROPIC_API_KEY`やlegacy DB fieldがrepo内に残っていても、それだけで現行サービス原価に含めない。runtime dependencyは実際のconsumerを確認して判断する。

## Metrics

```text
MRR = active paid subscribers × monthly price
gross revenue = MRR - refund
gross margin = gross revenue - payment fee - usage-linked infrastructure
conversion = new paid subscribers / eligible trial or free users
churn = canceled paid subscribers / paid subscribers at period start
```

推定値ではなくStripe、Vercel、Supabase等のdashboardから同じ期間の実数を取得する。secretや個人情報はdocsへ転記しない。

## Scale decision triggers

- provider limitの80%到達、または継続的なlatency / error増加: 該当serviceのscale調査
- infrastructure cost / active userの継続上昇: query、cache、data retentionを先に調査
- paid conversion / churnに十分な母数ができた時: price / entitlementを再評価
- 新しい有料serviceを追加する時: `company/accounts.md`へ用途・owner・解約条件を追加

過去のAI原価込みシミュレーションはGit履歴に残し、現在の判断材料としては使わない。
