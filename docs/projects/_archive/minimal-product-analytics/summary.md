---
status: current
last_verified: 2026-08-02
code:
  - apps/product/src/lib/analytics
  - apps/product/src/features/timeblock/server
  - apps/product/src/features/review
  - apps/product/src/app/api/trpc
  - apps/product/src/app/api/webhooks/stripe
  - apps/web/src/app/api
  - supabase/migrations/20260802013954_add_product_events.sql
---

# minimal-product-analytics 完了サマリー

外部分析SaaSを追加せず、Dayopt固有の主要行動をpayload-freeな6イベントとしてSupabaseへ記録する最小基盤を追加した。同じdeliveryで、統計の未分類バケットとWeb API timeoutの宣言契約も修復した。

## 完了した契約

- `product_events`は6つのevent nameと空の`properties`だけを許可する。browser roleには権限を与えず、applicationの`service_role`はINSERTだけを持つ
- signupは`auth.users`のadditiveな`AFTER INSERT` trigger、Plan / Record / Reviewは認証済みserver境界、checkoutはtRPC responseの成功index、subscriptionはStripeの処理済みmarker後に記録する
- application helperは1秒で打ち切るbest-effort処理とし、分析障害を本処理へ伝播させない。signup triggerも例外を吸収してaccount作成を継続する
- 90日より古いeventは、1回最大10,000件のowner-only functionを日次cronから実行して削除する。件数確認とretention backlogの診断queryは[運用手順(../../../operations/product-analytics.md)に集約した
- タグ未設定と削除済みtag IDは同じsyntheticな未分類bucketへ集約し、実体タグとして選択できないneutral表示にした。タグ別内訳の合計は総記録時間と一致する
- Webの全7 API routeが静的な`maxDuration`を宣言し、`vercel.json`の競合しうる`functions` globを撤去した。Resendの15秒contractは維持した

## 運用引き継ぎ

Web Vercel projectのDefault Function Timeoutはrepositoryから変更しない。merge後にTomoyaがDashboard値を確認し、route側の静的宣言をfallbackにしない運用状態を確認する。

詳細な設計と受入条件は[overview](./overview.md)を参照する。
