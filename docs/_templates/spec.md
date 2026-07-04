---
status: current
last_verified: 2026-07-03
---

# spec テンプレ

`product/specs/*.md` に機能単位で1ファイル。「現在の仕様の正」を書く。既存の `product/specs/entry.md` 等のパターンに準拠。

```markdown
---
status: current
last_verified: YYYY-MM-DD
code: apps/product/src/features/<feature> # 対応する実装コードのパス
---

# 機能名

1-2行の要約。

## 現在の振る舞い

- 箇条書きで仕様を列挙する
- 実装の詳細ではなく「何が起きるか」を書く

## 関連する意思決定

- 該当ドメインの log/YYYY-MM-DD-slug.md へのリンク — なぜこの仕様になったか
```
