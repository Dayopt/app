---
status: frozen
date: 2026-07-21
code:
  - apps/product/src/features/contact
  - apps/web/src/app/api/contact
---

# 問い合わせの受信と送信をCloudflare・Gmail・Resendへ分離する

## 背景・当時の前提

問い合わせ原文を保存していた`Dayopt/contact-private`は空であることを確認して削除済みで、現行Productionの問い合わせは復旧までfail-closedになる。個人向けサービスの現在規模では専用help deskより、既存Gmailをアクセス制限付きの運用受信箱として使う方が運用負荷を抑えられる。

## 決定と理由

- `support@dayopt.app`の受信はCloudflare Email Routingで既存Gmailへ転送する。catch-allは作らない
- 人が行う返信はGmailの「他のメールアドレスとして送信」から、専用のResend SMTP keyを使って`support@dayopt.app`として送る
- Product / WebのフォームはProductionだけResend APIで`support@dayopt.app`へ配送する
- フォーム用API keyと人の返信用SMTP keyを分離し、Product / Webのwebhook署名secretも分離する
- 問い合わせ原文はメール配送と運用受信箱に限定し、開発対応が必要な内容だけPIIを除いて通常Issueへ転記する

受信と送信のproviderを分けることで、Cloudflareの無料受信経路を使いながら、返信のFromと認証を既存のResend送信domainへ統一できる。

## 却下した選択肢と、なぜ捨てたか

- private GitHub Issueへの原文保存: 顧客対応と開発Issueの責務が混ざり、repository削除後の復旧にも適さない
- catch-all受信: 不要な宛先・spamの受信面を広げる
- フォーム用API keyとGmail SMTP keyの共用: 漏えい時の影響範囲とrotation対象が広がる
- Previewからの実配送: test送信と本番問い合わせが同じ受信箱へ混ざる

## 影響・やること

- 公開プライバシーポリシーへResend、Cloudflare Email Routing、Google Gmail、問い合わせ保持・削除運用を反映する
- DNS / Gmail設定とProduction切替は[問い合わせメールrunbook](../../operations/contact-email.md)に従う
- `v0.32.1`は受信・返信・両フォームのProduction smokeと30分観察後にだけreleaseする
