---
status: frozen
date: 2026-07-21
code:
  - apps/product/production-build-gate.mjs
  - apps/web/production-build-gate.mjs
  - apps/product/src/env.ts
  - apps/web/src/platform/config/production-runtime-env.ts
  - apps/product/src/features/contact/server/contact-service.ts
  - apps/web/src/app/api/contact/contact-email.ts
---

# ResendのReturn-Path subdomainをFrom domainとして扱っていた

v0.32.1のProduction smokeで、Web問い合わせのResend API requestが403になった。ResendのAPI keyは検証済みdomain `dayopt.app`に限定されていたが、`RESEND_FROM_EMAIL`は`noreply@send.dayopt.app`だった。

`send.dayopt.app`はResendのSPFとReturn-Pathに使うDNS subdomainであり、検証済みのFrom domainではない。直前のincident logはこの関係を逆に解釈していたため、本logで訂正する。

---

## 起きた事実

- Product / Webは同一SHAでReadyになり、Upstashのwrite token修正後にrate-limit書き込みも成功した
- Web問い合わせはResendの`POST /emails`まで進んだが、API keyが`send.dayopt.app`からの送信を許可していないため403になった
- Resend Dashboardで検証済みdomainは`dayopt.app`、API keyのdomain scopeも`dayopt.app`だった
- `send.dayopt.app`はResend用のMX / SPFを置くReturn-Path subdomainだった
- PR #1660は誤った仮説に基づいて送信元domainの許容範囲を広げていたため、本修正でapexだけへ戻す
- 送信はResendに受理されず、問い合わせメールやwebhook eventは生成されなかった

## 修正

- Productionの`RESEND_FROM_EMAIL`を`noreply@dayopt.app`へ統一する
- Product / Webのbuild gate、runtime env、送信serviceはFrom domainとしてapex `dayopt.app`だけを受理する
- `send.dayopt.app`を明示的に拒否する回帰testを追加する
- API keyは検証済みdomain `dayopt.app`限定のまま維持する

## 学び

- DKIM / SPF / Return-PathのDNS名と、ユーザーに表示するFrom domainを同一視しない
- metadata auditとProduction buildだけではprovider側のdomain authorizationを証明できない
- release前にproviderが受理した実送信を必須gateとして維持する
- incidentの仮説が後続の一次情報で覆った場合は、新しいfrozen logを作り旧logへ`superseded_by`を追記する
