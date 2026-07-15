---
status: frozen
date: 2026-07-15
---

# Chronotype と fulfillment の完全削除

Issue #1540 の docs 整合作業中に、残存資産を将来候補として維持せず、両概念を完全に削除する方針が示された。

---

## 原文

> 2つとも完全に削除でいいんじゃないかな。

## 文脈

`chronotype` は現行 UI に未接続のまま domain 型、DB setting、design token が残り、`fulfillment_score` は Record schema、service、統計入力、DB column に残っていた。Issue #1540 は当初、これらを削除せず stock docs と現行実装を整合させる範囲だった。

## 解釈

将来候補や互換資産として温存せず、Chronotype と FulfillmentScore をプロダクト概念・application contract・design token・DB schema から段階的に撤去する。

## 対応

destructive schema change の deploy 間隙を避けるため、最初に application code・token・stock docs の参照を削除し、本番で参照エラーがないことを確認した後、別 PR の migration で残存 column を削除する。
