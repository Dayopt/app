---
status: current
updated: 2026-07-21
---

# apps/web の import alias を '@/' から '@web/' へ変更する（Storybook whitelist の恒久対応）

## 背景・当時の前提

`apps/product` と `apps/web` はどちらも `@/` を自 app の `src/` に解決する tsconfig を持つ。Storybook（単一 Vite プロセス）では `@` を product/src へ向けた上で、web 固有パスだけを個別 alias で web/src へ向ける whitelist 方式を `apps/storybook/.storybook/main.ts` の `viteFinal` に置いていた（#1499）。

#1499 の起票時点の前提は「PR #1442 系列で whitelist が 4 件 → 12 件に増えた」だったが、2026-07-21 に調査した時点で whitelist は 2026-06-26 の整理以降ずっと 4 件のまま増えておらず、12 件に増える根拠とされた Web/Pages/Blog・Docs・Contact の story も現状の Storybook には存在しなかった。

調査の過程で、この 4 件の whitelist エントリ自体が実行時に機能していないことが判明した。`@/components/ui/actions/language-switcher` や `@/platform/privacy/browser-telemetry-consent` は該当エントリが存在するにもかかわらず import 解決に失敗しており（`Footer.stories.tsx` / `Header.stories.tsx` / `CookieConsentBanner.stories.tsx` の 3 story が起動不能）、`viteFinal` 内の `resolve.alias` オブジェクトの実際のキー順序をログ出力して確認したところ順序自体は正しかった。

## 決定と理由

`apps/web` の import alias を `@/*` から `@web/*` へ変更し、per-path whitelist を撤廃した。Storybook 側は `'@web': path.resolve(__dirname, '../../web/src')` の単一エントリのみで、product 向けの `'@'` と prefix が完全に分離するため衝突や順序依存が原理的に発生しない。

- `apps/storybook/tsconfig.json` が `"@/*": ["../product/src/*"]` を宣言しており、Storybook の Next.js 互換レイヤー（`vite-plugin-storybook-nextjs`、SWC ベースの transform、`enforce: 'pre'`）がこの tsconfig を読んで `@/` を **resolveId より前の transform 時点**で product/src へ書き換えていると推定される。これが `resolve.alias` の whitelist が機能しなかった実際の原因
- transform 時点の書き換えは resolveId ベースのどのプラグインでも介入できない。importer 起点の resolver plugin（`enforce:'pre'` + `config.plugins` 先頭固定）を実際に実装して検証したが、`resolveId` フックは一度も呼ばれず、main.ts に残っていた「resolveId が効かず断念」という過去の記録を独立に再現・裏付けした
- `apps/storybook/tsconfig.json` が知らない prefix（`@web/*`）であれば、Next.js 互換レイヤーの書き換え対象にならず素通りして Vite の通常の `resolve.alias` に到達するため、恒久的に安全

## 却下した選択肢と、なぜ捨てたか

### Option β: importer 起点の resolver plugin を再挑戦する

`enforce: 'pre'` で `config.plugins` の先頭に手動で unshift した独自 resolver を実装し、`apps/web` 配下の importer から呼ばれる `@/` import を検証したが、`resolveId` フックが一度も発火しなかった。Next.js 互換レイヤーの SWC transform が resolveId 以前に specifier を書き換えている可能性が高く、resolveId ベースのアプローチでは原理的に介入不可能と判断し、再挑戦を断念した。

### Option γ: 現状維持 + whitelist 追記手順を docs 化する

whitelist の各エントリが実行時に機能していないことが判明したため、「動かない仕組みの運用手順」を書くことになり、選択肢として成立しない。

## 影響・やること

- `apps/web/tsconfig.json`: `paths` を `"@/*"` → `"@web/*"` に変更
- `apps/web/src` 配下 74 ファイルの `@/` import を `@web/` へ一括置換
- `apps/web/next.config.mjs` の `experimental.optimizePackageImports`、`apps/web/components.json`（shadcn CLI alias）、`apps/web/vitest.config.ts` の `resolve.alias` を `@web/*` に追従
- `apps/storybook/.storybook/main.ts`: per-path whitelist（4 件）を撤廃し `'@web'` 単一エントリに簡略化
- `apps/web/package.json` に `@vitest/browser` / `@vitest/browser-playwright` を devDependencies として追加（`Header.stories.tsx` の Mobile Menu テストが `@vitest/browser/context` の `page.viewport()` でテスト用 iframe を実際にモバイル幅へリサイズするために必要。`@storybook/addon-viewport` が未導入のため `parameters.viewport` はこれまで何もしていなかった）
- 検証: `pnpm typecheck` / `pnpm lint` / `pnpm lint:boundaries` / `pnpm build:web`（110 ページ生成成功）/ `pnpm test-storybook` / `pnpm test-storybook:dark`（両方とも 136/136 pass、既知failure 0件）
- 関連issue: #1499、#1586
