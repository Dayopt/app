---
status: current
last_verified: 2026-07-30
code:
  - apps/product/src/features/contact
  - apps/web/src/app/api/contact
  - scripts/production-config-audit.mjs
---

# contact-delivery-migration 完了サマリー

Product / Web の問い合わせ配送を、削除済みの private GitHub repo から Resend 経由の `support@dayopt.app` へ移した。受信・返信・失敗検知が戻り、`v0.32.1` として出荷した。

## 完了した契約

- 両フォーム（Product の `contact.submit` tRPC と Web の `POST /api/contact`）が Resend で `support@dayopt.app` へ配送する。Production 限定、`submissionId` による idempotency、10 秒 timeout 付き
- webhook は app ごとに別エンドポイント・別署名 secret を持ち、processing lease と processed marker で重複処理を防ぐ
- Production 契約を 2 段で固定した: build 時の env 要求と、Vercel env の metadata だけを見る `scripts/production-config-audit.mjs`。旧問い合わせ credential は audit が常時拒否する
- 送信元は DKIM の問題を受けて検証済み apex ドメインに限定した

## 実装

- Resend 移行: `88dfb4f38` / audit・retry 強化: `7ce125b30` / webhook 契約: `fef61ea5c` / 送信元ドメイン修正: `efc6a4b61`, `04e59935c` / 旧 credential 恒久拒否: `1d9c1e110`
- 出荷: tag `v0.32.1`（`c3e219058`、2026-07-21）と同日の GitHub Release

## 運用

受信・返信の実際の経路は [contact-email.md](../../../operations/contact-email.md) を正本とする。追跡 issue [#1646](https://github.com/Dayopt/dayopt/issues/1646) は COMPLETED で close 済み。

詳細な設計と受入条件は [overview](./overview.md) を参照する。
