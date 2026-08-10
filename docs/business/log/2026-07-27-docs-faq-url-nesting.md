---
status: frozen
date: 2026-07-27
code:
  - apps/web/src/lib/mdx.ts
  - apps/web/src/app/[locale]/(docs)/docs/[...slug]
  - apps/web/next.config.mjs
---

# FAQ の公開 URL だけ /docs/faq/<slug> に階層化する

## 背景・当時の前提

[2026-07-24 のタスクベース IA 決定](./2026-07-24-docs-task-based-ia.md) §URL を変えなかった理由 では、フラット URL を維持し `[...slug]` catch-all 化もしないと決めていた。理由は「既存 URL が壊れ、redirect の管理が増える」。

その後、2026-07-27 に前提が 2 つ変わった。

**1. フラット名前空間がマーケティング redirect と衝突して本番障害になっていた。**

`next.config.mjs` の `/:locale/features` が `/docs/features` の `docs` を locale と誤認し、公開中の en FAQ 2 ページが 308 で LP アンカーへ飛ばされていた。

```
https://dayopt.app/docs/features  308 -> /docs/#features
https://dayopt.app/docs/pricing   308 -> /docs/#pricing
https://dayopt.app/ja/docs/features  200（3セグメントなのでマッチしない）
```

redirect 側は `(en|ja)` 制約で塞いだが、原因である「FAQ が一般名をグローバル名前空間で占有している」構造は残っていた。

**2. URL が誤解を生んでいた。**

en の公開 slug 10 個のうち 7 個が FAQ だった（`comparison` / `features` / `general` / `philosophy` / `pricing` / `privacy-security` / `technical`）。検索から `/docs/pricing` に来た人は料金ページを期待するが、実際は FAQ の 1 記事。

## 決定

**FAQ カテゴリだけ URL を階層化する。他のカテゴリはフラットのまま。**

`/docs/faq/pricing`、`/docs/faq/features`。タスク系カテゴリ（`plan` / `track` / `review` / `organize` / `data` / `troubleshooting`）は `/docs/plans` のまま変えない。

### FAQ だけ例外にする理由

フラット URL の利点は「ナビを再編しても URL が変わらない」こと。7/24 にファイルを `plan` / `track` へ移した時にこれが効いた。

**FAQ は「タスク」ではなく「形式」なので、他カテゴリへ移ることが構造上ない。** つまりこの利点がそもそも発生しない。一方でコスト（一般名の占有）だけを負担していた。

全カテゴリを階層化する案は採らなかった。タスク系ページは今後もカテゴリ間を移動しうるため、7/24 の利点を維持する価値がある。

### タイミング

FAQ ファイルは 2026-07-15 追加、カテゴリ再編は 7/24。SEO 資産の蓄積がほぼ無く、変えるなら最も安い時期だった。

## 実装

- `apps/web/src/lib/mdx.ts` に `NESTED_URL_CATEGORIES = ['faq']` と `buildDocSlug()` を置き、slug 導出の正本にした
- route を `docs/[slug]` から `docs/[...slug]` へ変更。`generateStaticParams` は `content.slug.split('/')` を返す
- 同じ規則を持つ独立実装が 3 つあるので合わせて更新した。`validate-content.js`（`routingSlugFor`）、`scripts/docs-coverage/collect.ts`、`apps/web/scripts/generate-search-index.ts`。**片方だけ変えると routing と validator がずれる**
- `docs-guard` の `DOC_SLUG_RE` が 2 セグメントを許すようにした（`public_docs: faq/pricing` を書けるようにするため）
- **旧 URL からの 301 は用意しない。** 本格公開前で外部から参照されていないため、旧 URL を延命すると設定だけが増える（2026-07-27 決定）。`/docs/pricing` 等は 404 になる
- `faq/index.mdx` を en / ja に新規作成（`/docs/faq` が 404 にならないように）

### FAQ index は `##` 見出しを使わない

`DocArticle` は `category === 'faq'` の時に `##` 見出しを Q&A として拾い `FAQPage` 構造化データを出す。index を `## [機能](/docs/faq/features)` の形で書いたところ、**質問名が markdown リンク記法そのもの**という壊れた構造化データが生成された。index は箇条書きにしてある。

FAQ カテゴリに index 以外の「見出しが質問でないページ」を足す場合は同じ問題が起きる。

## 検証

- 旧 URL は 404 になる（301 を置かない方針のため）。`/docs/pricing` `/ja/docs/general` で確認
- 実在ページの redirect は維持: `/releases` → `/blog/release`
- prerender は 24 routes（`● /[locale]/docs/[...slug]`）。SSG を維持している
- sitemap / 検索インデックス / docs サイドバー / `docs:coverage` がすべて新 URL を出す
- `/docs/faq` に `FAQPage` が出ず、`/docs/faq/pricing` には正しい Q&A で出る

## 次に触る人へ

**公開後は前提が変わる。** 被リンクが付いた URL を動かす時は 301 を必ず用意する。今回 301 を省いたのは、本格公開前で外部参照が無いという前提に依存している。

別カテゴリを階層化したくなったら `NESTED_URL_CATEGORIES` に足したうえで、上記の独立実装 3 箇所と `DOC_SLUG_RE` を必ず同時に更新する。
