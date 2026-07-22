---
status: current
last_verified: 2026-07-22
code:
  - apps/product/src/features/contact
  - apps/product/src/app/api/webhooks/resend
  - apps/web/src/app/api/contact
  - apps/web/src/app/api/webhooks/resend
  - scripts/production-config-audit.mjs
---

# contact-delivery-migration 完了サマリー

Product / Webの問い合わせ配送を、削除済みprivate GitHub repositoryから`support@dayopt.app`の運用受信箱へ移行した。Production送受信、返信、failure webhook、30分観察を完了し、`v0.32.1`として公開している。

## 完了した契約

- Product / Webの問い合わせはProductionだけでResendから固定の運用受信箱へ配送する。
- 問い合わせ本文、氏名、email、webhook raw bodyをlogger、Sentry、GitHub Issue、HTTP responseへ記録しない。
- Product / Web別の署名secretとdelivery sourceを使い、payloadとwebhook eventを重複排除する。
- Preview / Developmentには送信credentialを置かず、Production Config Auditでscope / typeを値非表示で検査する。
- 旧`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO`は全Vercel scopeで不在とし、監査が再追加を常時拒否する。
- 旧GitHub経路へrollbackせず、Resend設定またはapplication codeをroll-forwardする。

## Production証跡

- Cloudflare Email RoutingがActiveで、`support@dayopt.app`から運用Gmailへの受信を確認した。
- `support@dayopt.app`から返信でき、相手側に個人Gmailが表示されないことを確認した。
- Product / WebのProduction smoke、app別webhook、PII不在、30分観察を完了した。
- GitHub Issue #1646をcompletedでcloseし、`v0.32.1` releaseを公開した。
- `Dayopt/contact-private`と旧Vercel envを削除し、GitHub側で無効なcontact PATの1Password itemをarchiveした。

詳細な設計、検証、可逆性は[overview](./overview.md)と[問い合わせメール運用](../../operations/contact-email.md)を参照する。
