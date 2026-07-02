---
status: current
last_verified: 2026-07-02
---

# 指標定義（SSOT）

Dayopt が追う指標の定義。同じ名前の指標が文書によって違う定義で使われることを防ぐため、ここを正本とする。

| 名前                         | 定義式                                                     | データソース                                                                       | なぜこの定義か                                                                                               | 関連decision                                                                |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **指名検索数**               | Dayopt / dayopt を含む検索語のクエリ数（月次）             | Google Search Console                                                              | 認知ステップの計測指標。有料広告を使わない前提で、口コミ・コンテンツ発信の効果を唯一測れる先行指標           | [Growth Cycle](marketing/growth-cycle.md)                                   |
| **CVR（登録CVR）**           | LP訪問者数のうち登録完了に至った割合                       | Vercel Analytics + Supabase `profiles`                                             | 登録ステップの計測指標。「試してみよう」への転換を見る                                                       | [Growth Cycle](marketing/growth-cycle.md)                                   |
| **WAU**                      | 直近7日間に1件以上 entry を作成/編集したユニークユーザー数 | Supabase `entries` テーブル                                                        | 定着ステップの計測指標。日次ではなく週次にするのは、時間管理アプリの利用が毎日ではなく数日おきになりうるため | [Growth Cycle](marketing/growth-cycle.md)                                   |
| **課金率（Free→Pro転換率）** | 一定期間内にProへアップグレードしたFreeユーザーの割合      | Stripe + Supabase `profiles.subscription_status`                                   | 課金ステップの計測指標。損益分岐点の試算では 10% がキーKPI（5-10%のレンジで計算）                            | [Cost Optimization](cost-optimization.md#損益分岐点)、[Billing](billing.md) |
| **粗利率**                   | (売上 − インフラ・ツールコスト) / 売上                     | Stripe売上 + [external-services.md](../operations/external-services.md) の月額合計 | 事業の持続可能性を見る指標。Free/Pro/AIコストの構造がスケールに応じて変わるため定期的に再計算する            | [Cost Optimization](cost-optimization.md#粗利率の推移)                      |

## 意図的に追わないもの

- **共有・口コミ数** — 計測困難なため意図的に追わない（自然に任せる）。[Growth Cycle](marketing/growth-cycle.md) 参照
- **他社との比較指標**（業界平均等） — Dayoptは非交差のvalue curveを取る戦略のため、競合とのKPI比較は意味を持たない。[Competitors](competitors.md) 参照

## 【要判断】定義が確定していない指標

以下は言及はあるが定義式が文書上で確定していないため、確認が必要:

- **チャーン率** — cost-optimization.md には明示的な定義式の記載なし。月次解約率か、コホート単位のリテンション曲線か要確認
- **LTV / CAC** — 現状のマーケティング文書には数値・定義とも登場しない。有料広告を使わない前提のためCACは実質0に近いと想定されるが、明文化されていない
