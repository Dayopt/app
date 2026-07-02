# @dayopt/assets

> 責務境界の全体像: [docs/architecture/overview.md](../../docs/architecture/overview.md)

複数 app で共有する**静的素材の原本（source of truth）**を置く package。
ブランド・配信素材（logo / app icon / favicon / PWA icon / OG・social image）と、
複数 app で使う汎用 illustration の原本だけを持つ。

> 「何でも置き場」ではない。責務を小さく保つための package。
> 参照: [ADR / issue #1399](https://github.com/Dayopt/dayopt/issues/1399)

## 構造

```
packages/assets/
  brand/        ブランド原本（logo-mark.svg ほか）
  app-icons/    product / web / PWA 共有の配信用アイコン
  social/       OGP / social card の共通原本
```

`illustrations/` と `press/` は、実際に複数 app で使うことが確定してから追加する（現状未作成）。

## 入れる / 入れない

**入れる**: logo / symbol / wordmark / app icon / favicon / PWA icon / maskable icon /
Apple touch icon / OG・Twitter card image / 複数 app で使う汎用 illustration —— の**原本のみ**。

**入れない**:

| 入れないもの                                    | 正しい置き場                               |
| ----------------------------------------------- | ------------------------------------------ |
| design token / CSS variables                    | `@dayopt/foundations`                      |
| React component（`<Logo />` 等）                | `@dayopt/components`                       |
| ブランド名 / URL / contact email                | `@dayopt/config`                           |
| 文言 / 翻訳                                     | `apps/*/messages`                          |
| LP 専用 hero 画像                               | `apps/web/public` or `apps/web/src/assets` |
| product 専用スクショ / feature 画像 / blog 画像 | `apps/*` / `docs`                          |
| user upload 画像                                | （対象外）                                 |

`next/image` wrapper・i18n・marketing copy も入れない。

## Logo の扱い（react-free 方針）

SVG 原本と React component を分離する。

- **SVG 原本** → `packages/assets/brand/logo-mark.svg`（この package）
- **`<Logo />` component** → `@dayopt/components`（`primitives/logo.tsx` で SVG を inline で保持）

`@dayopt/assets` は **react を import しない**（静的ファイルのみ）。

## Boundary（依存方向）

`@dayopt/assets` は最下層に近い package。**他を import しない**。

```
apps/product ─┐
apps/web ─────┼──> @dayopt/assets
apps/storybook┘
```

NG: `@dayopt/assets` → `apps/*` / `@dayopt/components` / `@dayopt/foundations` / `next/*` / `react`

## 配信（source of truth → public）

`packages/assets` は原本。実際の配信は app の `public/` 等にコピーする。

```
packages/assets        = 原本
apps/product/public    = 配信コピー
apps/web/public        = 配信コピー
```

> Future: `pnpm assets:sync`（原本→各 app/public 同期）と eslint での boundary 強制、
> Storybook `Assets/*` 一覧は、実素材が揃ってから導入を判断する。
