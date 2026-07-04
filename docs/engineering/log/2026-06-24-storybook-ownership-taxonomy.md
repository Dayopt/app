# ADR-023: Storybook story-title の所有境界 top-level（Shared / Product / Web）

> accepted（2026-06-24）

> [ADR-022](./2026-06-23-component-taxonomy.md) が「別途の cosmetic 作業」として残した Storybook story `title:` の再整列を確定する。
> 物理配置・barrel・公開 API は不変。サイドバーの **top-level 階層のみ**を変える。

---

## コンテキスト

[ADR-021](./2026-06-22-shared-packages-canonical-and-app-shims.md) / [ADR-022](./2026-06-23-component-taxonomy.md) で共有 UI を `packages/components` に canonical 集約し、第二階層を
責務ベース 9 category に切り直した。その際 story の `title:` は物理 path と decouple している
ため再整列は保留された（[ADR-022](./2026-06-23-component-taxonomy.md)「結果／トレードオフ」）。

保留の結果、サイドバー top-level は `Components / Features / Foundations / Patterns` のままで、
**所有境界が読めない**状態になっていた。とくに第二階層 category の精緻化により、共有資産と
app 固有 component が同じ `Components/<Category>/` に混在した：

- `Components/Inputs/Input`（`packages/components`）と `Components/Inputs/MiniCalendar`（`apps/product`）が同居
- `Components/Display/Avatar`（shared）と `Components/Display/LabeledRow`（product）が同居

サイドバー上で「どの package / app の資産か」が判別できない。

## 決定

Storybook の **top-level を所有境界（package / app）**で分ける。第二階層以下は現状維持。

| top-level   | 実体           | 第二階層                                                  |
| ----------- | -------------- | --------------------------------------------------------- |
| `Shared/*`  | `packages/*`   | `Foundations` / `Components`（責務9category）/ `Patterns` |
| `Product/*` | `apps/product` | `Components` / `Features` / `Emails`                      |
| `Web/*`     | `apps/web`     | `Components` / `Sections` / `Pages`（予約のみ）           |

- `title:` の再整列は **物理ディレクトリ基準**で機械適用する（shared と product が同じ
  `Components/` prefix を共有するため、prefix 一致では分離できない）。
- `apps/storybook/.storybook/preview.tsx` の `storySort.order` を新 top-level に更新。
  `Shared/Components` 直下は [ADR-022](./2026-06-23-component-taxonomy.md) の責務 9 category 順を維持する。
- `apps/web` は story 未作成のため、`main.ts` の glob 追加 + `Web/Overview`（`apps/web/src/Web.docs.mdx`）
  placeholder + storySort 枠で**構造だけ予約**する。

## 詳細

### 物理位置と title の対応（移行ルール）

| 物理位置                                     | 旧 title prefix             | 新 title prefix                                                   |
| -------------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| `packages/components/src/**`                 | `Components/`               | `Shared/Components/`                                              |
| `packages/foundations/src/**`                | `Foundations`               | `Shared/Foundations`                                              |
| `apps/storybook/.storybook/stories/patterns` | `Patterns/`                 | `Shared/Patterns/` または `Product/Patterns/`（依存ベース、下記） |
| `apps/product/src/components/**`             | `Components/`               | `Product/Components/`                                             |
| `apps/product/src/features/**`               | `Features/` / `Components/` | `Product/Features/` / `Product/Components/`                       |
| `apps/product/src/emails`                    | `Patterns/Email`            | `Product/Emails`                                                  |

### 例外

- `Foundations/States` は token doc だが物理的には `apps/product/src/lib/styles/tokens/` に在る。
  サイドバーの一貫性を優先し `Shared/Foundations/States` に揃える（title と物理位置の軽微な
  不一致を許容。将来 `packages/foundations` へ移設する余地あり）。
- `apps/product` 内で `Components/` を名乗っていた straggler（`ColorPaletteMenuItems` /
  `Props Inventory` / app-shell の `BottomTabBar`）は `Product/Components/` に寄せた。

### Patterns は依存ベースで Shared / Product に分割

`patterns/` 配下は物理的に 1 ディレクトリに同居するため、物理位置では分けられない。代わりに
**story の import 依存**で判定する。「shared pattern は `@dayopt/components` だけで再現できるもの」
という所有境界の原則に従い、`@/`（product 内部: `@/components` / `@/lib` / `@/features`）に
依存する pattern は `Product/Patterns/` に置く。

| 分類                | pattern                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `Shared/Patterns/`  | Actions, Cards, ErrorPages, Forms, Loading, Selection                   |
| `Product/Patterns/` | Confirmation, Copywriting, EmptyStates, ErrorStates, Feedback, Security |

ファイルは `apps/storybook/.storybook/stories/patterns/` に据え置き、title だけ付け替える
（`Foundations/States` と同じ title↔位置 decouple）。

## 結果

### メリット

- サイドバー top-level から所有境界（package = `Shared` / app = `Product`・`Web`）が一目で読める
- `Shared = packages` がツリー上で自明になり、混在していた共有 / app 固有 component が分離された
- 1 つの Storybook で全レイヤを横断しつつ責務が分かれる

### トレードオフ

- title は依然 [ADR-022](./2026-06-23-component-taxonomy.md) 同様に物理 path と decouple（位置を動かさず top-level だけ付け替える方式）。
  `Foundations/States` のような軽微な title↔位置の不一致が残る
- `Web/*` は当面 `Web/Overview` 1 枚のみ（個別 story は今後追加）

## 関連

- [ADR-021](./2026-06-22-shared-packages-canonical-and-app-shims.md) — 共有レイヤー（packages canonical / app 直接 import）
- [ADR-022](./2026-06-23-component-taxonomy.md) — 共有 component の責務ベース 9 category（第二階層）。本 ADR はその保留事項
  （story title 再整列）を top-level の所有境界軸で確定する
- `apps/storybook/.storybook/preview.tsx` — `storySort.order`
- `apps/web/src/Web.docs.mdx` — Web レイヤーの予約と命名規約
