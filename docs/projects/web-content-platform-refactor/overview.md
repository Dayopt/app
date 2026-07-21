---
status: done
last_verified: 2026-07-21
code:
  - apps/web/content
  - apps/web/src/app/[locale]/(marketing)/legal
  - apps/web/src/platform
  - apps/web/src/lib
---

# web-content-platform-refactor — legal content と Web 共通基盤の責務分割

GitHub issue #1534・#1535 を、ユーザー指示により1ブランチ・1 PRで実装する。法務文書の content ownership と Web 内部モジュールの責務を整理し、公開挙動を維持する。

## Goal

法務文書を route 実装から MDX content へ移し、metadata・env・error・汎用 helper を責務別モジュールへ分割する。

## Minimum Viable Approach

1. SEO metadata と env は責務別ファイルへ分割し、既存 import path を named re-export facade として維持する。
2. Web 固有の error normalization と structured error を分け、runtime consumer のない helper は削除する。Product 側とは契約が異なるため共通化しない。
3. `lib/utils.ts` の class name 結合と読了時間計算を責務名モジュールへ移し、consumer と shadcn 設定を更新する。
4. en / ja の privacy、terms、cookies、tokushoho、security を `content/legal` へ移し、route-private loader と legal 専用 MDX renderer で表示する。
5. characterization test、content validation、build、E2E、目視比較で挙動不変を確認する。

## Public Interfaces

- `@/platform/seo/metadata`: 現在の named export を維持する。
- `@/platform/config/env`: 現在の型・値・helper export と eager `env` snapshot を維持する。
- `@/lib/error-utils` / `@/lib/utils`: facade は残さず、Web 内 consumer を責務別 path へ移す。
- legal loader: `LegalDocumentSlug` と `{ title, description, lastUpdated }` frontmatter を route 内部だけに公開し、不正・欠落・言語不一致を明示的に失敗させる。

## Behavior Contract

- 法務ページの URL、en / ja locale、文面、metadata、主要 link、responsive layout、開発限定 review warning、`revalidate = 86400` を維持する。
- 連絡先は `@dayopt/config` から注入し、content に固定値を複製しない。
- security は明示 locale 読み込みにより SSG へ正規化されてもよい。公開 response と1日 revalidation は変えない。
- env の URL 優先順位、CI / Preview bypass、Production validation 順序、error の message / logging fallback を変えない。

## Reversibility Table

| 変更                       | 可逆性 | 戻し方                      |
| -------------------------- | ------ | --------------------------- |
| platform / lib 分割        | 10分   | #1535 の commit を revert   |
| legal MDX 移行             | 10分   | #1534 の commit を revert   |
| translation key 整理       | 5分    | #1534 の commit から復元    |
| GitHub issue / PR metadata | 5分    | label・本文・comment を更新 |

schema、data migration、外部設定、Production mutation は含まない。

## Existing Code to Reuse

- `apps/web/src/lib/mdx.ts` が利用する `next-mdx-remote/rsc` と frontmatter parse の構成
- `apps/web/scripts/validate-content.js` の content 検証フロー
- `@dayopt/config` の連絡先設定
- `@dayopt/i18n/navigation` の locale-aware `Link`
- 現在の法務ページ DOM / Tailwind token / metadata
- Web の Vitest と `apps/web/src/test/e2e/i18n-smoke.spec.ts`

## Verification

- `pnpm --filter @dayopt/web validate:content`
- `pnpm lint:web`
- `pnpm typecheck:web`
- `pnpm test:web`
- `pnpm build:web`
- `pnpm test:e2e:smoke`
- `pnpm quality:deadcode:ci`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm lint:boundaries`
- `pnpm check`
- en / ja の全10法務ページと、390px 幅の cookies / tokushoho / security を移行前後で比較する。

### Results

- `validate:content`: 81 filesを検査し、error 0。既存docsの`ai` metadata warning 1件のみ。
- Web: lint / typecheck / 34 files・181 unit tests / buildを通過。buildは109/109 pagesを生成し、既存blog NFT warning以外の追加warningなし。
- 法務E2E: local developmentとCI productionの両方で14/14 testsを通過。10ページの本文hash、metadata、主要href、heading/table/list数を固定した。
- Root: typecheck / lint / boundaries / dead-code / `pnpm check` / E2E smokeを通過。Product E2Eは14 pass・4 skip、Web E2Eは14 pass。
- i18n / docs: `i18n:check`、`copy:check`、`docs:check`を通過。
- 視覚比較: 最新`origin/main`との本文hashは10/10一致。desktop 10枚と390px 6枚は10枚がpixel完全一致、残る6枚も文字antialias差のみ（最大0.0018%）で、サイズ・配置差なし。
- route mode: securityを含む法務10 URLは、すべて1日revalidationのSSGとして生成された。

## Completion Summary

- #1535: SEO / envの既存facadeを維持しつつ責務別moduleへ分割し、Web固有error処理と汎用helperを責務名pathへ移した。Productとのerror helper共通化は行っていない。
- #1534: en / jaの5文書をstrict frontmatter付きMDXへ移し、route-private loader・専用renderer・content validatorを追加した。連絡先はcontentへ複製せず`@dayopt/config`から注入する。
- `architecture-guard`と`behavior-verifier`で両issueをread-onlyレビューし、contact ownership、validator strictness、development/production E2E差を修正後に再レビュー済み。risk-reviewerは対象となるauth・RLS・billing・migration等を変更しないため利用していない。
- Production deploy、release、PR merge、法務文面や既存security linkの改善はdeferred scopeのまま。

## What I'm Not Doing

- 法務文面、導線、既存 security 関連 link の改善
- Web と Product の error helper 共通化
- 新規 top-level feature、Storybook、package manifest、lockfileの変更
- Sentry、Supabase、Production deploy、release、PR merge
