---
status: current
last_verified: 2026-08-10
---

# spec テンプレ

`product/specs/*.md` に機能単位で1ファイル。「現在の仕様の正」を書く。既存の `product/specs/plan-record.md` 等のパターンに準拠。

```markdown
---
status: current
last_verified: YYYY-MM-DD
code: apps/product/src/features/<feature> # 対応する実装コードのパス
public_docs: [] # 対応する公開docs（apps/web/content/docs）のslug配列。無ければ空配列
lp: [] # LPがこの機能について約束している文言の配列。言及が無ければ空配列
---

# 機能名

1-2行の要約。

## 現在の振る舞い

- 箇条書きで仕様を列挙する
- 実装の詳細ではなく「何が起きるか」を書く

## 関連する意思決定

- 該当ドメインの log/YYYY-MM-DD-slug.md へのリンク — なぜこの仕様になったか
```
