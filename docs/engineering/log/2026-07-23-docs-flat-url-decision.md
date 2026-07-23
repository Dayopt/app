---
status: frozen
date: 2026-07-23
code: apps/web/src/lib/mdx.ts
---

# 公開 docs の URL はフラット 1 階層で確定

## 決めたこと（1 行）

公開 docs の URL は `/docs/<ファイル名>` のフラット 1 階層を正式決定とし、衝突ガードを `validate-content.js` に追加した。

## 背景・当時の前提

- `apps/web/src/lib/mdx.ts` は `content/docs/{locale}/<category>/<name>.mdx` を URL `/docs/<name>`（`index.mdx` はカテゴリ名）に写像していた。実装上の事実であって決定として記録されておらず、frontmatter の `ai.relatedDocs` には実在しない階層 URL（`/docs/features/plans` 等）が書かれていた
- 外部共有・AI クローラ開放の直前で、URL 契約を確定するならこのタイミングしかなかった

## 決定と理由

フラットを維持する。カテゴリはナビゲーション上の表示分類にとどめ、URL の一部にしない。

- カテゴリ taxonomy はプロダクトが若い間に再編されうる。フラットなら記事のカテゴリ移動・カテゴリ改名で URL が壊れない
- 短い URL は共有・被リンクに有利
- 弱点（ロケール内ファイル名の衝突）は `apps/web/scripts/validate-content.js` の `checkDocsSlugCollisions` で機械的に防ぐ

あわせて `ai.relatedDocs` の値を実在するフラット URL に全件修正した。

## 却下した選択肢

- **階層 URL 化（`/docs/features/plans`）**: パンくずのセマンティクスは得られるが、カテゴリ再編のたびに URL 破壊 or リダイレクト網の維持が必要になる。ドキュメント数十本規模では割に合わない

## 影響・やること

- 新規 docs 追加時はファイル名がロケール内で一意であること（`pnpm --filter @dayopt/web validate:content` が検証）
- 関連: [2026-01-13-domain-url-structure.md](./2026-01-13-domain-url-structure.md)
