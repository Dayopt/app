---
status: frozen
date: 2026-07-21
superseded_by: docs/operations/log/2026-07-21-incident-resend-from-domain-scope.md
code:
  - apps/product/production-build-gate.mjs
  - apps/web/production-build-gate.mjs
  - apps/product/src/env.ts
  - apps/web/src/platform/config/production-runtime-env.ts
---

# Resend送信サブドメインをProduction gateが拒否した

PR #1658のmain merge後、正本どおりに設定された`noreply@send.dayopt.app`をProduction build gateが無効な送信元として拒否し、Product / WebのProduction deploymentがbuild errorになった。PreviewではProduction限定gateを実行しないため検出されなかった。

---

## 起きた事実

- 2026-07-21 11:28 JST、PR #1658をmerge commit`763617665`でmainへmergeした
- merge前のVercel metadata auditはProduct / Webとも成功していた
- Product / WebのProduction buildは、それぞれ検証済み`RESEND_FROM_EMAIL`を要求するgateで停止した
- 1Passwordの正本値は`noreply@send.dayopt.app`で、Vercelへ同期された値と運用設計は正しかった
- build gate、runtime env検証、送信serviceは`endsWith('@dayopt.app')`を使い、`dayopt.app`直下だけを許可していた
- Resendで検証済みの送信domainは`send.dayopt.app`であり、正本値とcode契約が不一致だった

## 影響範囲

- 失敗したProduct / Web deploymentはProductionへ昇格せず、既存Production aliasは置き換わっていない
- Product / Webを同一merge SHAでReadyにするrelease gateを満たせないため、実送信smoke、30分観察、tag、GitHub Releaseを停止した
- Previewの表示と通常CIは成功していたが、Production限定の実値契約を証明していなかった
- 問い合わせ本文、氏名、メールアドレスなどのPII漏えいは確認されていない

## 学び

- metadata auditのkey / target / type確認だけでは、値がcode contractを満たすことを証明できない
- Production Contractのsafe dummyは、実運用のdomain構造を保つ代表値にする必要がある
- 組織domainの検証は文字列suffix全体ではなく、メールアドレスのdomain partが`dayopt.app`またはそのサブドメインかを判定する
- Preview成功後も、同一merge SHAのProduction buildと実送信をrelease前の独立gateとして維持する
