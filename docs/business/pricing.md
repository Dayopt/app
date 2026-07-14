---
status: current
last_verified: 2026-07-14
code:
  - packages/billing/src/pricing.ts
  - packages/billing/src/plans.ts
  - packages/billing/src/entitlement.ts
---

# 価格戦略

Dayoptの現在の価格契約と、価格を変更する時に守る判断基準。ユーザーに見える実装仕様は[Billing spec](../product/specs/billing.md)を正とする。

## 現在の契約

| Plan | 価格       | Trial   | Entitlement  |
| ---- | ---------- | ------- | ------------ |
| Free | $0         | なし    | 基本体験     |
| Pro  | $5 / month | 初回7日 | `pro_access` |

- 年額planは未実装
- exact valueは`@dayopt/billing`を正とし、UIから独自の価格定数を持たない
- `BILLING_ENFORCED`の既定はfalse。enforcementを有効にするまで`proProcedure`は認証だけを要求する
- Free / Proの最終的な機能境界は[#1336](https://github.com/Dayopt/dayopt/issues/1336)で管理する

## 判断基準

- FreeでPlan / Record / Calendarの基本loopを理解できるようにする
- Proは「件数を増やす」より、継続利用で価値が増える分析・連携・exportを候補にする
- 価格やtrialを変更する時はbilling package、Stripe Price、UI copy、LP、Billing specを同じ変更で揃える
- in-app AIは提供しないため、model API原価を価格根拠に含めない
- 実ユーザーのconversion / churn evidenceがない推定表を現行契約として扱わない

## 変更前に必要な証拠

1. current paid / trial / canceled数とconversion
2. checkout開始から完了までのdrop-off
3. cancel理由とPro機能の利用実績
4. provider dashboardで確認した実コスト
5. 価格変更が既存subscriberへ与える影響

仮説・競合比較は[competitors.md](./competitors.md)、サービス費用の計算方法は[business-model.md](./business-model.md)を参照する。
