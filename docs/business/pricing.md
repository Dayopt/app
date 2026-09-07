---
status: current
last_verified: 2026-09-07
code:
  - packages/billing/src/pricing.ts
  - packages/billing/src/plans.ts
  - packages/billing/src/entitlement.ts
---

# 価格戦略

Dayoptの現在の価格契約と、価格を変更する時に守る判断基準。ユーザーに見える実装仕様は[Billing spec](../product/specs/billing.md)を正とする。

## 現在の契約

**始めるのは無料。続けた分だけ、Pro が返す。**

| Plan | 価格       | Trial   | Entitlement                                   |
| ---- | ---------- | ------- | --------------------------------------------- |
| Free | $0         | なし    | なし                                          |
| Pro  | $5 / month | 初回7日 | 4-key map（`@dayopt/billing` entitlement.ts） |

| 面                                     | Free               | Pro            | gate の型                   |
| -------------------------------------- | ------------------ | -------------- | --------------------------- |
| 予定・記録・カレンダー・アクティビティ | 全部、無制限       | 同じ           | なし                        |
| 過去の週を見に行く                     | どこまでも遡れる   | 同じ           | なし                        |
| 週の report と明細                     | ○                  | 同じ           | なし                        |
| 月・年の集計、期間をまたぐ推移         | ×                  | ○              | 入力レンジ（`granularity`） |
| 過去の自分との比較                     | ×                  | ○              | 入力レンジ                  |
| 見積もりのフィードフォワード           | 直近 28 日から算出 | 全履歴から算出 | service の算出期間          |
| Google カレンダー同期                  | ×                  | ○              | procedure + cron skip       |
| MCP / API                              | ×                  | ○              | route                       |
| データエクスポート                     | ○                  | ○              | なし                        |
| Billing / Settings / アカウント削除    | ○                  | ○              | なし                        |

- 年額planは未実装
- exact valueは`@dayopt/billing`を正とし、UIから独自の価格定数を持たない
- `BILLING_ENFORCED`の既定はfalse。enforcementを有効にするまで`entitledProcedure`は認証だけを要求する
- 境界の正本は本表。変更は epic [#2610](https://github.com/Dayopt/dayopt/issues/2610) の手順に従う

## 判断基準

- FreeでPlan / Record / Calendarの基本loopを理解できるようにする
- Proは「件数を増やす」より、継続利用で価値が増える分析・連携・exportを候補にする
- 価格やtrialを変更する時はbilling package、Stripe Price、UI copy、LP、Billing specを同じ変更で揃える
- in-app AIは提供しないため、model API原価を価格根拠に含めない
- 実ユーザーのconversion / churn evidenceがない推定表を現行契約として扱わない
- 閲覧は縛らず、集計を Pro にする
- 数量上限・履歴深さ・指標本数で分けない
- trial は積み重ねの価値が見える長さにする（初期値 30 日、確定は [#2614](https://github.com/Dayopt/dayopt/issues/2614)）

## 変更前に必要な証拠

1. current paid / trial / canceled数とconversion
2. checkout開始から完了までのdrop-off
3. cancel理由とPro機能の利用実績
4. provider dashboardで確認した実コスト
5. 価格変更が既存subscriberへ与える影響

仮説・競合比較は[competitors.md](./competitors.md)、サービス費用の計算方法は[business-model.md](./business-model.md)を参照する。
