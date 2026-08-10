---
status: current
last_verified: 2026-07-30
code: apps/web/src/features/marketing
---

# lp-launch-content 完了サマリー

launch 前の LP から実装にない表記を外し、最終的なコピーとセクション構成を確定した。この project が生んだ issue [#1486](https://github.com/Dayopt/dayopt/issues/1486)–[#1496](https://github.com/Dayopt/dayopt/issues/1496) は全て close 済み。

## 完了した契約

- Hero の見出しを戦略側の既定 "Plan days you can actually keep." に揃えた（#1487）
- Pricing の架空の機能行、"Free for 14 days"、AI と「時間 P&L」の表現を削り、実装どおりの表記に置き換えた（#1486 / #1488、`1e9320a02`）
- 登録 CTA の遷移先を統一（#1489）、OG 画像と SEO meta を実態へ合わせ（#1494）、使われていない marketing セクションを削除した（#1495）
- Problem セクションを LP に組み込み（#1490、`9dabcd33c`）、"Open by design"（MCP / iCal / API-first）を追加した（#1493、`806bbfd9c`）

## 意図的に作らなかったもの

overview で P0 に置いていた FAQ（#1491）、Final CTA（#1492）、実プロダクトスクリーンショット（#1496）は **NOT_PLANNED として close** した。未着手の残作業ではなく、作らないという判断。

最終構成は **Hero → Problem → How → Open by design → Pricing** で、overview の §3 / §4 / §8 が想定した構成より短い。

詳細な設計と初期の監査結果は [overview](./overview.md) を参照する。
