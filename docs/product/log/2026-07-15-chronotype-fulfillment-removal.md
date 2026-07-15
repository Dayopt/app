---
status: frozen
date: 2026-07-15
---

# Chronotype と FulfillmentScore を完全に削除する

## 背景・当時の前提

両概念は現行 UI に接続されていない一方、Chronotype は domain 型・DB setting・design token、FulfillmentScore は Record API・統計入力・DB column に残っていた。Issue #1540 は当初、残存資産を維持したまま docs を整合させる想定だった。

## 決定と理由

Chronotype と FulfillmentScore を将来候補や互換資産として温存せず、プロダクト概念・runtime contract・design system・DB schema から完全に削除する。利用者に見えない概念を残すほど、Record contract と開発判断が曖昧になるため。

破壊的な column drop は runtime 撤去と同じ deploy に含めず、application 参照ゼロの production 確認後に別 PR で行う。

## 却下した選択肢と、なぜ捨てたか

- docs だけを legacy 表現へ揃える — 不要な code path と token が残り続ける
- 将来候補として dormant 資産を維持する — 再導入の具体的な計画がなく、現在の contract を複雑にする
- code と DB column を同時に削除する — deploy 間隙で旧 runtime が欠落 column を読む危険がある

## 影響・やること

- Phase 1 で Record / Settings / export / MCP の公開 contract、統計、Calendar、domain、token、Story、Eagle、seed、docs から参照を削除する
- Phase 1 deploy 後に Sentry と production contract を確認する
- Phase 2（Issue #1625）で非 null 件数を監査し、既存値を破棄することを確認したうえで両 column を drop し、canonical schema と generated types を更新する
