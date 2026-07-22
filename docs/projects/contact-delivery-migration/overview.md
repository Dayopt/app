---
status: done
last_verified: 2026-07-22
code:
  - apps/product/src/features/contact
  - apps/product/src/app/api/webhooks/resend
  - apps/web/src/app/api/contact
  - apps/web/src/app/api/webhooks/resend
  - scripts/production-config-audit.mjs
---

# contact-delivery-migration — 問い合わせ配送の復旧

Product / Web の問い合わせを削除済みの private GitHub repository から `support@dayopt.app` の運用受信箱へ移し、受信・返信・失敗検知までを復旧する有限Project。

## Goal

- Product / Web の問い合わせ原文を、Resendから`support@dayopt.app`へProduction限定で配送する
- `support@dayopt.app`宛の通常メールをCloudflare Email Routingで既存Gmailへ転送し、GmailからResend SMTP経由で同じ差出人として返信できるようにする
- Preview / Developmentからの実配送、問い合わせPIIのログ記録、重複送信、署名されていないwebhook処理を拒否する

## 現在地

問い合わせ配送、受信・返信、Production smoke、30分観察、`v0.32.1` releaseは完了し、Issue [#1646](https://github.com/Dayopt/dayopt/issues/1646) はclose済み。`Dayopt/contact-private`と両Vercel projectの旧GitHub envは削除済みで、旧contact PATはGitHub APIで`401`を確認後に1Password itemをarchiveした。

Production Config Auditは旧`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO`の再追加を常時拒否する。今後の問い合わせ配送障害は旧GitHub経路へ戻さず、Resendまたはapplication codeをroll-forwardする。

## Delivery

1. **Runtime** — 両フォームを固定To / From / 件名、検証済みReply-To、payload単位idempotency、10秒timeoutのResend配送へ切り替える。
2. **Abuse / privacy** — per-userまたはper-IPと全体quotaをfail-closedで適用し、問い合わせPIIをlogger / Sentry / HTTP responseへ記録しない。
3. **Webhook** — Product / Web別の署名secretとsource tagを使い、processing leaseからprocessed markerへ遷移させる。
4. **Production contract** — Production buildにResend・Upstash・Web Turnstileを要求し、Preview / Developmentの送信credentialをmetadata auditで拒否する。
5. **Operations** — Cloudflare受信、Gmail返信、同一SHA deploy、送受信smoke、観察、旧経路cleanupを[runbook](../../operations/contact-email.md)どおりに行う。

## Acceptance Criteria

- `contact.submit`と`POST /api/contact`が`submissionId: uuid`を受け、成功形式`{ success: true }`を維持する
- credentialが存在してもProduction以外では配送しない
- Product / Webそれぞれの`POST /api/webhooks/resend`が自分の失敗eventだけを署名検証・重複排除して扱う
- Production build gateとmetadata auditが値を出さずに必要なenv scope / typeを検査する
- 必須のlocal / CI検証がpassする
- Cloudflare Active、受信、support@返信が確認済みである
- Product / Webが同一SHAでReadyになり、各フォーム1通の受信、Reply-To、webhook、Sentry / logのPII不在を確認する
- 30分の観察後に`v0.32.1`tagとGitHub Releaseを作り、旧GitHub env / PATと作業branch / worktreeを整理する

## Trusted Audit Constraint

`pull_request_target` workflowはtrusted base revisionだけを実行するため、追加した`Production Config Audit`は導入PR自身では起動しない。また、audit contractを変更する将来のPRではbase contractの結果をheadの証拠にできない。workflowは変更前後のfilenameを検査してcontractの編集・renameを検出し、該当時はfailする。通常CIでsafe dummy testを通したうえで、maintainerがexact head SHAをレビューしたclean checkoutからmetadata-only auditを行う。merge後の初回成功を確認してからrequired statusを継続する。未レビューのPR codeへ`VERCEL_TOKEN`を渡す例外は作らない。

## Reversibility

- DNS移管で到達性を失った場合は、Vercel Registrarのnameserverを元のVercel nameserverへ戻す
- application配送は削除済みrepositoryへ戻さず、Resend設定またはcodeを修正してroll-forwardする
- merge前のrepo変更はbranch削除、merge後はcommit revertで戻せる。ただし受信経路が未完成の状態でProductionへ進めない

## Out of Scope

- 新しいhelp desk、CRM、Sentry Replayの導入
- database migration
- 問い合わせと無関係なVercel / 1Password secret cleanup
- 実際のCloudflare、Gmail、Resend SMTP設定（ユーザー側のcheckpoint）

## Completion Summary

- Product / Webの問い合わせ原文をProduction限定でResendから`support@dayopt.app`へ配送する契約へ移行した。
- Cloudflare Email Routingによる受信と、個人Gmailを露出しない`support@dayopt.app`からの返信を確認した。
- app別webhook、idempotency、rate limit、Turnstile、PIIをlogger / Sentryへ渡さない境界を実装・検証した。
- Product / Webを同一releaseへdeployし、送受信smokeと30分観察後に`v0.32.1`を公開した。
- `Dayopt/contact-private`、Vercelの旧GitHub env、失効済みcontact PATのactive運用を終了した。
