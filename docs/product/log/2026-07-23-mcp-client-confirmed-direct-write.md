---
status: frozen
date: 2026-07-23
code: apps/product/src/app/api/mcp
---

# MCPの操作確認はclientへ委ね、Dayoptは正規データへ直接反映する

## 背景・当時の前提

外部AIからDayoptのPlan → Track → Learnを完結するには、Plan / Recordをreadするだけでなく正規データを変更できる必要がある。当初はDayopt内にproposalとapproval URLを持つ案も検討したが、対応AI client自身がtool実行前の確認UIや承認方針を持てる。

## 決定と理由

- write scopeを持つMCP clientからのtool callを操作要求として扱い、Dayoptの正規データへ直接反映する
- 操作ごとの確認はclientの責任とし、Dayoptは確認が行われた事実を独立には検証しない
- Dayoptは現在の接続、scope、Pro entitlement、ドメイン制約、競合制御、冪等性、成功mutationの監査を保証する
- `confirmed: true`のようなclient自己申告fieldは受け付けない。確認の証明にならず、誤った安全感だけを作るため

この責任分界なら、clientごとの自然な確認体験を維持しながら、Dayoptは自ら検証できる認可とデータ整合性へ責任を集中できる。

## 却下した選択肢と、なぜ捨てたか

- Dayopt内proposal / approval URL / 承認状態機械 — 二重の確認体験と期限・revoke後状態を増やし、client側確認がある一般的なMCP接続面を複雑にする
- `confirmed` booleanをtool inputへ追加 — clientの自己申告にすぎず、承認主体・時刻・対象payloadを証明できない
- scopeなしのgeneric mutation — 最小権限、tool discovery、監査、domain validationを崩す

## 影響・やること

- Plan / Recordごとのtyped write toolとscopeを用意する
- apply transactionでconnection/token/entitlementを再検証し、正規データ変更とidempotency receiptを一括commitする
- global / client / connection単位でwriteを停止できるようにする
- tool名、scope matrix、receipt schemaは3 clientのgolden contract後に別のdecision logで固定する
