---
status: current
last_verified: 2026-07-23
---

# Docs / Blog / Release notes の役割分担

外部公開コンテンツ（`apps/web/content/`）の 3 種類は役割が違う。混ぜない（#1438）。

| 種類          | 目的                                                                | 書く場所                                            |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| Docs          | **usage** — 機能の使い方を早く理解して、すぐ使えるようにする        | `apps/web/content/docs/{en,ja}/`                    |
| Blog          | **context / product thinking** — 課題の背景、設計の考え、開発の記録 | `apps/web/content/blog/{en,ja}/`                    |
| Release notes | **changes** — 何が変わったかの事実                                  | Blog の `category: 'release'` 記事 + GitHub Release |

## ルール

- **Docs に長い思想を書かない。** 「なぜこの設計か」を語りたくなったら Blog に書き、Docs からリンクする
- **Blog に手順だけを閉じ込めない。** 操作手順が主役なら Docs に書く。Blog は「なぜ」「どう考えたか」が主役
- **重要な仕様変更を casual post に隠さない。** 挙動が変わる変更は Release notes（blog の `release` カテゴリ記事）に明記し、該当する Docs も同じタイミングで更新する
- 3 種類の間は本文中の内部リンクでつなぐ。同じ説明を 2 箇所に書かない

## 関連

- 文章基準: [writing-style.md](./writing-style.md)
- 公開前チェック: [review-checklist.md](./review-checklist.md)
- 運用フロー（いつ何を書くか）: [docs/marketing/content-operations.md](../marketing/content-operations.md)
