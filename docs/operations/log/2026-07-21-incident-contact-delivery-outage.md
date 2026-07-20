---
status: frozen
date: 2026-07-21
code:
  - apps/product/src/features/contact
  - apps/web/src/app/api/contact
---

# Production問い合わせの配送先が利用不能になった

2026-07-21時点で、Product / Webの問い合わせ配送先だったprivate repositoryは削除済みだが、Production codeはそのrepositoryへのGitHub Issue作成を正規経路としている。この不整合により問い合わせ送信はfail-closedになる。

## 起きた事実

- `Dayopt/contact-private`は2026-07-17に、空であることと関連resourceがないことを確認して削除された
- 削除時点の`main`は`GITHUB_TOKEN` / `GITHUB_CONTACT_REPO`を使うGitHub Issue配送を継続していた
- `support@dayopt.app`には確認済みのMX / 運用受信箱がなく、代替経路はまだ稼働していなかった
- ユーザーからPreviewは表示できる一方でProductionが失敗する状態が報告された
- PreviewがReadyであることは、Production限定のbuild/runtime契約や実送信を証明しない
- この記録の作成時点では、失敗したdeploymentまたはrequestのlog IDを保存できていないため、個別failureの段階は未確定である

## 影響

- Product / Webから送られた問い合わせは成功扱いにならず、運用受信箱にも保存されない
- フォームはfail-closedであるため、公開repository、ログ、Sentryへの問い合わせ本文のfallback保存は行わない
- 既存アプリ本体のカレンダー・タスク・認証データには影響しない

## 原因

削除する旧保存先と、新しい受信・返信・アプリ配送経路の切替が同一のcheckpointになっていなかった。さらにPreviewのReady状態とProductionの配送可能状態を別契約として検査する仕組みが不足していた。

## 対応

- 最新main上で問い合わせ配送をResendへ再構成する
- Production以外の実配送をcodeで拒否する
- Production build gateとVercel metadata auditを分け、required envとscope/typeを検査する
- Cloudflare受信とGmail返信を先に確認し、両Vercel projectが同一SHAでReadyになってから各フォームを1回ずつsmokeする
- 30分観察後まで旧GitHub env / PATを保持し、その後に削除・失効する

## 再発防止

- 外部配送先を削除する前に、新経路の受信・返信・Production smokeを完了条件にする
- Previewの成功をProduction成功として扱わない
- secret値を扱わない`Production Contract`と`Production Config Audit`をrelease前の独立gateにする
- 配送経路の変更は[問い合わせメールrunbook](../contact-email.md)の順序で行う
