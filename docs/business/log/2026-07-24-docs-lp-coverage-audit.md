---
status: frozen
date: 2026-07-24
---

# 公開 docs と LP の突き合わせ監査

LP・公開 docs・内部 docs の情報が連携できているかを確認した。役割分担のルールは整備済みだが実態が追いついておらず、ギャップを機械的に出す手段も無かった。

## 見つかったもの

### 1. 別製品のテンプレートが本番公開されていた

`apps/web/content/docs/ja/getting-started/quick-start.mdx` の中身が「YourSaaS」というボイラープレートのままだった。`npx create-yoursaas-app`、`YOURSAAS_API_KEY`、`support@yoursaas.com` など Dayopt と無関係な SDK 製品の説明で、`draft` 指定が無いため公開されていた。

`apps/web/content/docs/ja/account/index.mdx` も、存在しない 4 サブページ（profile / billing / api-keys / security）へリンクするスタブのまま公開されていた。

どちらもファイルごと削除した。

### 2. LP の約束と公開 docs の乖離

LP の Pricing が名指しする機能のうち、公開 docs があるのは Plan だけだった。

| LP の約束                                 | 監査時点の公開 docs          |
| ----------------------------------------- | ---------------------------- |
| Calendar — day, week, and multi-day views | ja のみ（en 欠落）           |
| Plan and Record tracking                  | Plan は公開、Record は draft |
| Core Review metrics / All Review metrics  | なし                         |
| Tags / Unlimited tags                     | なし                         |
| API and MCP access                        | なし（内部 spec も無い）     |
| Data export                               | なし                         |

Record は本文が揃っているのに `draft: true` のままで、LP が無料プランで謳っている機能が読めない状態だった。

API・MCP は実装がある（`apps/product/src/app/api/v1`、`apps/product/src/app/api/mcp`、`apps/product/src/lib/oauth-server`）のに `docs/product/specs/` に spec が無い。公開 docs 以前に内部の正本が欠けている。

### 3. frontmatter の slug と category が routing と食い違っていた

`apps/web/src/lib/mdx.ts` は slug をファイル名から、category をディレクトリから導出し、frontmatter の同名フィールドを上書きする。そのため frontmatter に `slug: 'features/plans'` と書いてあっても実際の URL は `/docs/plans` だった。21 ファイルでずれていた。

この嘘は実害を出していた。ja の docs には `/docs/features/records`、`/docs/guides/tags`、`/docs/features/shortcuts` など存在しないページへのリンクが並んでいた（en は 2026-07-14 の PR で修正済みだった）。値を実 routing に揃え、ずれを `validate:content` の error にした。URL 自体は変わっていない。

### 4. 公開中の入口ページが実在しない機能を説明していた

`apps/web/content/docs/{en,ja}/getting-started/index.mdx` は「機能一覧」の表で **Stats**（Heatmap, charts, and time analysis）、**Search**、**Keyboard Shortcuts** を挙げ、本文でも「The Stats dashboard shows you patterns」と説明している。`apps/product/src/features/` にあるのは auth / calendar / contact / review / settings / tags / timeblock で、`stats` feature は存在しない。振り返りの正本は `docs/product/specs/review.md` の Review panel であり、名前も中身も一致しない。Calendar の「agenda views」も、実際の day / week / multi-day とは違う。

ja 版はこの節が英語のまま残っている（`getting-started/index.mdx` の 60 行以降）。

書き直しは本文執筆にあたるため、この監査では手を入れず issue に回す。

### 5. ギャップを出す手段が無かった

`pnpm docs:check` は内部 docs の構造（リンク・frontmatter・命名・log 凍結）だけを見る。公開 docs の内容ギャップは月次 `docs-audit` skill の目視運用に依存していた。

## やったこと

- 上記 2 ファイルを削除し、参照していた 6 ファイルのリンクを実在ページに直した
- `placeholder: true` を導入し、`draft: false` との併用を `validate:content` の error にした（1 の再発防止）
- 未執筆ページを placeholder スタブとして作成（review / tags / api-mcp / data-export の ja 4 本）。docs を ja 先行に切り替えたため en 側は作らない
- `docs/product/specs/` の frontmatter に `public_docs` と `lp` を追加し、機能レジストリの正本にした。対応表を別ファイルで二重管理しない
- `pnpm docs:coverage` を追加。spec を軸に実ファイルと LP を突き合わせ、埋まり具合・LP 逆引き・en/ja 非対称を出力する
- 公開ページの本文から 404 へのリンクを `validate:content` の error にした。リンク先が「ファイルごと無い」場合と「draft のため出ない」場合の両方を止める。frontmatter の `ai.relatedDocs` はユーザーが踏まないため draft 参照を許容し、ファイル不在だけを error にする

## 監査時点のカバレッジ

`pnpm docs:coverage` の集計で、レジストリ登録済み 8 slug のうち ja で公開済みは 4（`/docs/plans`、`/docs/pricing`、`/docs/calendar`、`/docs/account-troubleshooting`）。en は ja 先行方針に切り替えたため、抜けは coverage が一覧し続ける。

## 残したもの

本文の執筆と翻訳はこの作業に含めない。以下は別 issue として起票する。

- quick-start の書き直し（ja）
- account 系 docs の設計（何を公開するか）
- Record docs のレビューと公開
- ja が固まったあとの en 追随（docs 全体）
- placeholder スタブ 4 本の本文執筆
- API・MCP の内部 spec 新設
- getting-started の機能一覧を現行の機能名に直す（Stats → Review 等）と、ja 版の未翻訳部分の翻訳

LP 側の文言は変更していない。Record が非公開であることは docs を公開して解消する方向とし、LP から約束を削る判断はしていない。公開までの間は 404 を出さないよう、公開ページ本文からの Record へのリンクを外した（Codex レビュー #1717 の指摘）。Record を公開する時にリンクを戻す。

`ProblemSection` は component・翻訳文言・Story が揃っているのに LP に配置されていない（`apps/web/src/app/[locale]/(marketing)/page.tsx` が import していない）。今回のスコープ外として記録だけ残す。

## 関連

- [コンテンツ運用](../content-operations.md)
- [コンテンツ運用の決定](./2026-07-23-content-operations.md)
