# I-01: knip 棚卸しレポート（2026-06-12）

> **対象**: `apps/product/knip.json` の誤検出（false positive）解消と、残存 unused の対処方針づけ（全件 I-06c で処理）
> **レポート**: [reports/knip-before-2026-06-12.json](./reports/knip-before-2026-06-12.json) / [reports/knip-after-i01-2026-06-12.json](./reports/knip-after-i01-2026-06-12.json)

## 修正内容と効果

| 区分            | before    | after    | 備考                                                   |
| --------------- | --------- | -------- | ------------------------------------------------------ |
| unused files    | 12        | 11       | `src/lib/i18n/request.ts` の誤検出解消（entry に追加） |
| dependencies    | 8         | 1        | `@dayopt/*` 6 件 + `@tailwindcss/typography` を ignore |
| devDependencies | 15        | 13       | `sharp` / `tw-animate-css` を ignore                   |
| exports / types | 219 / 249 | 変化なし | 誤検出ではない。I-06a/b/c の削除対象                   |
| duplicates      | 4         | 4        | I-06 / I-08 で処理                                     |

**方針（Codex review #3400131838 を反映）**: I-01 の責務は **false positive のみ ignore**。「product で真に未使用」な依存は ignore せず **reported のまま残す**（実削除・移動は I-06c）。当初 root-only 重複 7 件も ignore していたが、それは「product 側の重複を隠す」ことになり Codex 指摘どおり不適切なため ignore から除外し reported に戻した。

### ignoreDependencies に残すもの（product で間接使用される＝真の false positive のみ）

knip.json は JSON のためコメント不可。理由をここに記録する。

| dependency                | 理由                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dayopt/*`               | workspace TS ソース package（`exports: "./src/index.ts"`）。apps/product 単体実行の knip では workspace 解決不可。実使用は grep で確認済み。Q7 の packages 統合（I-22）で対象縮小予定 |
| `sharp`                   | `next.config.mjs` / Next.js 画像最適化のランタイム依存                                                                                                                                |
| `tw-animate-css`          | `src/lib/styles/globals.css` / `animations.css` の `@import`。knip は CSS を解析しない                                                                                                |
| `@tailwindcss/typography` | `globals.css` の `@plugin` 参照。同上                                                                                                                                                 |

## 残存 unused = 全て I-06c で処理する真の対処対象（14 件）

### グループ 1: root-only 重複（product から削除 or root へ移動 → I-06c）

product では未使用だが root package.json にも宣言があり、実使用は root スコープ（`.husky` / root config / root scripts）。**ignore せず reported のまま**にして I-06c で product 宣言を削除する。

| dependency                                                         | 実使用箇所（root）                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `@commitlint/cli` / `@commitlint/config-conventional`              | `commitlint.config.js` + `.husky/commit-msg`（`npx commitlint`） |
| `lint-staged`                                                      | `.husky/pre-commit` + `lint-staged.config.mjs`                   |
| `culori`                                                           | `scripts/eagle-foundations.ts`                                   |
| `zod-to-json-schema`                                               | `scripts/generate-api-spec.ts`                                   |
| `prettier-plugin-organize-imports` / `prettier-plugin-tailwindcss` | `.prettierrc` の plugins                                         |

### グループ 2: 削除候補 / 別 app へ移動（→ I-06c）

| dependency                  | 分類              | 根拠 / 対応 issue                                                                                          |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `@tanstack/react-virtual`   | **削除候補**      | repo 全体でソース参照ゼロ（oss-credits.json は生成物）。Q5 で削除方針決定済み → I-06c                      |
| `@eslint/eslintrc`          | **削除候補**      | repo 全体で参照ゼロ（flat config 移行の残骸と推定）→ I-06c                                                 |
| `lightningcss`              | **要確認**        | 参照ゼロだが Tailwind v4 の optional native 依存の可能性。削除 → `pnpm build` 検証で確定 → I-06c           |
| `mermaid`                   | **削除候補**      | ソース参照ゼロ（hit は storybook-static ビルド成果物のみ）→ I-06c                                          |
| `@typescript-eslint/parser` | **別 app へ移動** | 実使用者は `apps/web/eslint.config.mjs`。apps/web の package.json へ移動 → I-06c                           |
| `@tailwindcss/vite`         | **別 app へ移動** | 実使用者は `apps/storybook/.storybook/main.ts`。apps/storybook へ移動 → I-06c                              |
| `remark-gfm`                | **別 app へ移動** | 実使用者は `apps/storybook/.storybook/main.ts` + `apps/web` の blog/releases ページ。各 app へ移動 → I-06c |

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
