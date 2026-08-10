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

## Metrics（指標定義のSSOT）

Dayoptが追う指標の定義。同じ名前の指標が文書によって違う定義で使われることを防ぐため、ここを正本とする（旧 `kpi.md` を吸収、2026-08-10）。

```text
MRR = active paid subscribers × monthly price
gross revenue = MRR - refund
gross margin = gross revenue - payment fee - usage-linked infrastructure
conversion = new paid subscribers / eligible trial or free users
churn = canceled paid subscribers / paid subscribers at period start
```

推定値ではなくStripe、Vercel、Supabase等のdashboardから同じ期間の実数を取得する。secretや個人情報はdocsへ転記しない。実数の定期取得は月次ガーデニング（`.claude/skills/gardening/SKILL.md` §自動パート）がjournalに記録する。

### 成長ファネルの計測指標

グロースサイクル（認知 → 登録 → 定着 → 課金）の各ステップに1指標。運用は[marketing/strategy.md](../marketing/strategy.md)を参照。

| 名前                         | 定義式                                                                  | データソース                                             | なぜこの定義か                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **指名検索数**               | Dayopt / dayopt を含む検索語のクエリ数（月次）                          | Google Search Console                                    | 認知ステップの計測指標。有料広告を使わない前提で、口コミ・コンテンツ発信の効果を唯一測れる先行指標           |
| **CVR（登録CVR）**           | LP訪問者数のうち登録完了に至った割合                                    | Vercel Analytics + Supabase `profiles`                   | 登録ステップの計測指標。「試してみよう」への転換を見る                                                       |
| **WAU**                      | 直近7日間に1件以上 Plan または Record を作成/編集したユニークユーザー数 | Supabase `plans` / `records` テーブル                    | 定着ステップの計測指標。週次にするのは、時間管理アプリの利用が毎日ではなく数日おきになりうるため             |
| **課金率（Free→Pro転換率）** | 一定期間内にProへアップグレードしたFreeユーザーの割合                   | Stripe + Supabase `profiles.subscription_status`         | 課金ステップの計測指標。目標値は実データの母数ができてから置く（過去のBEP試算の5-10%は未検証でGit履歴扱い）  |
| **月次解約率（チャーン）**   | 当月中に解約した Pro ユーザー数 ÷ 月初の Pro ユーザー数                 | Stripe                                                   | 事業の持続可能性を見る2指標の1つ。コホート別リテンション曲線はユーザー数が少ないうちは追わない（2026-07-03） |
| **粗利率**                   | (売上 − インフラ・ツールコスト) / 売上                                  | Stripe売上 + [accounts.md](../company/accounts.md)の実費 | 持続可能性のもう1つの指標。コスト構造はスケールで変わるため実invoiceで定期的に再計算する                     |

### 意図的に追わないもの

- **共有・口コミ数** — 計測困難なため意図的に追わない（自然に任せる）
- **他社との比較指標**（業界平均等） — 非交差のvalue curveを取る戦略のため、競合とのKPI比較は意味を持たない（[competitors.md](./competitors.md)）
- **LTV / CAC** — 有料広告を使わない前提のためCACは実質0であり、比率管理は意味を持たない。持続可能性は粗利率とチャーン率で見る

### プロダクト内で見せる指標との関係

ユーザーに見せる進捗指標は事業KPIとは別系統。一次証拠は**見積もり精度の推移**（過去の自分との事実比較。[strategy.md §4-6](./strategy.md)）であり、ストリーク・点数・ランク等のgamification指標はプロダクトにも事業KPIにも存在しない。

## Scale decision triggers

- provider limitの80%到達、または継続的なlatency / error増加: 該当serviceのscale調査
- infrastructure cost / active userの継続上昇: query、cache、data retentionを先に調査
- paid conversion / churnに十分な母数ができた時: price / entitlementを再評価
- 新しい有料serviceを追加する時: `company/accounts.md`へ用途・owner・解約条件を追加

過去のAI原価込みシミュレーションはGit履歴に残し、現在の判断材料としては使わない。
