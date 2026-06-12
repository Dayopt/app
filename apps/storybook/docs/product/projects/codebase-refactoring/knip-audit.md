# I-01: knip 棚卸しレポート（2026-06-12）

> **対象**: `apps/product/knip.json` の誤検出解消と、残存 unused の 3 分類（削除候補 / 公開 API 化 / 要確認）
> **レポート**: [reports/knip-before-2026-06-12.json](./reports/knip-before-2026-06-12.json) / [reports/knip-after-i01-2026-06-12.json](./reports/knip-after-i01-2026-06-12.json)

## 修正内容と効果

| 区分            | before    | after    | 備考                                                   |
| --------------- | --------- | -------- | ------------------------------------------------------ |
| unused files    | 12        | 11       | `src/lib/i18n/request.ts` の誤検出解消（entry に追加） |
| dependencies    | 8         | 1        | `@dayopt/*` 6 件 + CSS 参照 1 件を ignore              |
| devDependencies | 15        | 6        | 間接使用 9 件を ignore                                 |
| exports / types | 219 / 249 | 変化なし | 誤検出ではない。I-06a/b/c の削除対象                   |
| duplicates      | 4         | 4        | I-06 / I-08 で処理                                     |

## ignoreDependencies に追加した理由（knip.json は JSON のためコメント不可。理由はここに記録）

| dependency                                                         | 理由                                                                                                                                       | 本来の置き場所                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `@dayopt/*`                                                        | workspace TS ソース package（`exports: "./src/index.ts"`）。apps/product 単体実行の knip では workspace 解決不可。実使用は grep で確認済み | 現状で正。Q7 の packages 統合（I-22）で対象自体が縮小予定 |
| `@commitlint/cli` / `@commitlint/config-conventional`              | root `commitlint.config.js` + `.husky/commit-msg`（`npx commitlint`）から使用                                                              | **root package.json への移動が本筋**（I-06c で判断）      |
| `lint-staged`                                                      | `.husky/pre-commit`（`npx lint-staged`）+ root `lint-staged.config.mjs` から使用                                                           | 同上                                                      |
| `culori`                                                           | root `scripts/eagle-foundations.ts` から使用                                                                                               | 同上                                                      |
| `zod-to-json-schema`                                               | root `scripts/generate-api-spec.ts` から使用                                                                                               | 同上                                                      |
| `prettier-plugin-organize-imports` / `prettier-plugin-tailwindcss` | root `.prettierrc` の plugins                                                                                                              | 同上                                                      |
| `sharp`                                                            | `next.config.mjs` / Next.js 画像最適化のランタイム依存                                                                                     | 現状で正                                                  |
| `tw-animate-css`                                                   | `src/lib/styles/globals.css` / `animations.css` の `@import`。knip は CSS を解析しない                                                     | 現状で正                                                  |
| `@tailwindcss/typography`                                          | `globals.css` の `@plugin` 参照。同上                                                                                                      | 現状で正                                                  |

## 残存 unused の 3 分類

### dependencies / devDependencies（7 件 = 全て真の対処対象）

| dependency                  | 分類             | 根拠 / 対応 issue                                                                                          |
| --------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-virtual`   | **削除候補**     | repo 全体でソース参照ゼロ（oss-credits.json は生成物）。Q5 で削除方針決定済み → I-06c                      |
| `@eslint/eslintrc`          | **削除候補**     | repo 全体で参照ゼロ（flat config 移行の残骸と推定）→ I-06c                                                 |
| `lightningcss`              | **要確認**       | 参照ゼロだが Tailwind v4 の optional native 依存の可能性。削除 → `pnpm build` 検証で確定 → I-06c           |
| `mermaid`                   | **削除候補**     | ソース参照ゼロ（hit は storybook-static ビルド成果物のみ）→ I-06c                                          |
| `@typescript-eslint/parser` | **置き場所違い** | 実使用者は `apps/web/eslint.config.mjs`。apps/web の package.json へ移動 → I-06c                           |
| `@tailwindcss/vite`         | **置き場所違い** | 実使用者は `apps/storybook/.storybook/main.ts`。apps/storybook へ移動 → I-06c                              |
| `remark-gfm`                | **置き場所違い** | 実使用者は `apps/storybook/.storybook/main.ts` + `apps/web` の blog/releases ページ。各 app へ移動 → I-06c |

### unused files（11 件）

| ファイル                                                                                                                                                            | 分類                        | 対応                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------- |
| `src/features/review/components/tag-detail/{TagAccuracyTrendChart,TagDetailHero,TagDowChart,TagFulfillmentDistribution,TagHourlyChart,TagRecentBlocks}.tsx`（6 件） | **削除候補（Q1 承認済み）** | I-04。liveness 表は [tag-detail-liveness.md](./tag-detail-liveness.md)                  |
| `src/features/contact/index.ts`                                                                                                                                     | **要確認**                  | dynamic import 経由の可能性。I-06c で参照経路確認後に entry 追加 or barrel 整理（I-08） |
| `src/features/{auth,calendar,tags}/domain/index.ts` + `calendar/domain/interaction/index.ts`（4 件）                                                                | **要確認（barrel 設計）**   | 「domain barrel は feature 内部用」の契約確定（I-08）とセットで削除 or entry 化         |

### exports 219 / types 249

個別リストは [reports/knip-after-i01-2026-06-12.json](./reports/knip-after-i01-2026-06-12.json) を一次資料とする。カテゴリ別の傾向:

| カテゴリ                                                                                                                                                    | 傾向                       | 既定の扱い                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------- |
| feature barrel の再 export（entry domain 関数、tags 定数等）                                                                                                | barrel の出しすぎ          | **削除候補**（export 内部化）→ I-06a/b/c     |
| Zustand selector / 内部定数（grid 定数等）                                                                                                                  | 内部用が export されている | **削除候補**（export 除去）→ I-06a/b/c       |
| Zod schema / 型                                                                                                                                             | 公開契約に見えるが未参照   | I-06 で個別判断。残すなら `@public` タグ必須 |
| duplicates 4 件（`TAG_COLOR_NAMES`/`TAG_COLOR_PALETTE`、`isOverlapping`/`entriesOverlap`、`HOUR_HEIGHT`/`TIME_LABEL_HEIGHT`、`MS_PER_HOUR`/`CACHE_1_HOUR`） | 同値 export の二重定義     | **統合**（片方へ寄せる）→ I-06 / I-08        |

## invalidate 再計測（Phase 0 タスク 4）

| パターン                                        | 件数（test 除外） | 評価                                             |
| ----------------------------------------------- | ----------------- | ------------------------------------------------ |
| `queryClient.invalidateQueries` 直呼び          | **0**             | 混在なし。既に `utils.x.invalidate()` に統一済み |
| `utils.x.invalidate()`                          | 71                | 標準形                                           |
| `setData` / `setQueriesData` / `getQueriesData` | 72                | 大半は optimistic update の正当なキャッシュ操作  |

**結論**: 当初 M6 として懸念した「invalidate 流儀の混在」は実在しない（当初の 226 という数字は誤計測）。Phase 4 の「invalidate 統一」タスクは**規約の docs 化のみ**に縮小してよい。
