---
status: done
last_verified: 2026-08-02
code:
  - apps/product/src/lib/analytics
  - apps/product/src/features/timeblock/server
  - apps/product/src/features/review/server
  - apps/product/src/app/api/trpc
  - apps/product/src/app/api/webhooks/stripe
  - supabase/migrations/20260802013954_add_product_events.sql
---

# minimal-product-analytics — 最小利用イベント

外部分析SaaSを追加せず、Dayopt固有の主要行動だけをpayload-freeで数える有限Project。GitHub issue #1427を正本の要求として、signup、Plan / Record作成、Review表示、checkout開始、subscription開始の6 eventを扱う。

## Goal

- 成功した主要行動をserver-sideでbest-effort記録する
- browserからevent tableを読み書きできず、applicationのservice roleもINSERT以外できないようにする
- email、氏名、token、title、noteなどのPIIを格納できないschemaにする
- eventを90日で削除し、運用者が日次件数とretention backlogを確認できるようにする

## Data flow

```text
auth.users AFTER INSERT ───────────────────────────────┐
timeblock / review server service ─┐                  │
tRPC checkout response + after() ─┼→ track helper ───┼→ product_events
Stripe verified + deduplicated ───┘                  │
                                                     └→ daily pg_cron cleanup
```

`user_id`は認証済みserver context、保存済みbilling profile、または`auth.users` triggerからだけ取得する。client inputのuser IDは使わない。`properties`は将来拡張用の予約列だが、現contractでは空object以外をdatabase constraintで拒否する。

## Delivery

1. additive migrationでtable、allowlist、RLS / GRANT、signup trigger、retention jobを追加する
2. 1秒で打ち切るbest-effort helperを作り、失敗をproduct mutationへ伝播させない
3. 各featureのserver境界で成功後にeventを記録する。tRPC batch checkoutだけはapp compositionで成功responseを判定し、`after()`へ渡す
4. allowlist、空payload、失敗非伝播、重複抑止、route / service接続をtestで固定する
5. 日次数とretentionの運用契約を[product analytics運用(../../../operations/product-analytics.md)へ残す

## Acceptance Criteria

- 6 event以外をapplication helperとdatabase constraintの双方が拒否する
- signup analytics failureがaccount作成を止めない
- Plan / Record作成、Review open transition、成功したcheckout、deduplicate後のsubscription開始だけが記録対象になる
- browser roleにtable権限がなく、service roleはINSERTだけを持つ
- 90日より古いeventを上限付きjobで削除できる
- repositoryのtypecheck、lint、boundary、i18n、test、Supabase reset / snapshot checksがpassする

## Out of Scope

- propertiesへの属性追加、ユーザー単位の分析画面、外部analytics SaaS
- update / delete event、旧`entry_*`event
- Production databaseへの手動SQL適用。migrationはGitHub連携のPreviewからProductionへ進める

## Reversibility

applicationのinstrumentationはevent insertを止めるだけで機能動作に影響しない。schemaを戻す必要がある場合は既存migrationを書き換えず、trigger / cron / tableを順に除去する新しいforward migrationを作る。
