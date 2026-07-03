---
status: current
last_verified: 2026-07-03
---

# decision テンプレ

各ドメインの `log/` に `YYYY-MM-DD-slug.md` として置く。5分で書ける軽さを守る。技術・ビジネスを問わず同じ形式。

```markdown
---
status: current # current | superseded | frozen
updated: YYYY-MM-DD
---

# 決めたこと(1行)

## 背景・当時の前提

## 決定と理由

## 却下した選択肢と、なぜ捨てたか

## 影響・やること
```

書いたら凍結し、編集しない。訂正が必要な場合は新しいログを追加し、古い方の `status` を `superseded` に変更する。
