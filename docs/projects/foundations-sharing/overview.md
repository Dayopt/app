# foundations-sharing — Project 設計書

策定日: 2026-06-19
規模: 中〜大規模（3 アプリの CSS 横断。ただし下記の通り視覚 regression リスクは実測で極小）
親 project: `shared-packages-restructure`（本 project はその P1 を独立切り出し）

---

## Goal

Dayopt 全体で使う design tokens を `packages/foundations` に集約し、product / web / storybook が**同じ token を参照する**状態にする。

---

## スコープ（ユーザー確定）

**やる:**

- `packages/design` を `packages/foundations` へ整理（改名）
- canonical token を**無 prefix に統一**
- product/web の token 差分を reconcile
- product/web/storybook の globals.css から foundations を import

**やらない:**

- `@dayopt/ui` → `@dayopt/components` の改名
- Button / Card / Dialog の統合
- product/web の `lib/components/ui` 削除
- dialog/sheet の挙動統一
- `@dayopt/config` の改名
- eslint/tsconfig 共有

---

## 最重要ファクト（実測）

1. **token 同名・異値の衝突 = 0 件**（:root / .dark 別でも 0）。web は product から手動同期されており値が一致。→ reconcile は危険な「値統合」ではなく**安全な union**。web の見た目はほぼ変わらない
   - product: 129 token / web: 95 token / 共有 86（全て同値）/ product 固有 43 / web 固有 9
   - web 固有9（取り込み必須）: `--color-state-focus`, `--elevation-{gradient-card,highlight,sunken,surface}`, `--popover(-foreground)`, `--tooltip(-foreground)`
2. **制約: `--dayopt-*`（A体系 / 現 `theme.css`）は本 project で消さない**。`@dayopt/ui`（触らない対象）が `bg-[var(--dayopt-color-*)]` で依存中。foundations は無 prefix canonical と**並行して** `--dayopt-*` theme.css を提供し続け、apps は両方 import を維持する（A体系の廃止は components project の領域）

---

## 現状の token 配置

| 場所                                                                            | 内容                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `packages/design/src/theme.css`                                                 | A体系 `--dayopt-*`（`@dayopt/ui` 用）。3 globals.css ＋ storybook preview が import |
| `packages/design/src/{index,colors,spacing,radius,shadow,typography,tokens}.ts` | **死蔵**（`@dayopt/design` の `.` export は参照 0）                                 |
| `apps/product/src/lib/styles/tokens/*.css`（6） + `tailwind-theme.css`          | B体系 無 prefix の**正候補**（superset）                                            |
| `apps/web/src/styles/tokens/*.css`（4） + `tailwind-theme.css`                  | B体系 無 prefix（web 固有9を含む）                                                  |

---

## 目標の foundations 構造

```
packages/foundations/
  src/
    tokens/            # トークンごとに co-locate: colors.css + Colors.stories.tsx + Colors.mdx ...
                       #   無prefix CSS（union: primitives/colors/radius/spacing/states/z-index/elevation）
                       #   ＋ Foundations/* の story(PascalCase) と mdx
    tokens.css         # アグリゲータ（tokens/*.css → @theme を順に @import する単一 import 口）
    tailwind-theme.css # @theme inline（product superset を正）
    theme.css          # 旧 --dayopt-* を温存（@dayopt/ui 用、本 project では削除しない）
  package.json         # exports: ./tokens.css, ./theme.css（CSS のみ。死蔵 JS トークンは削除済み）
```

> 補足（後続フォローアップで実施済み）: 死蔵かつ legacy 体系を記述していた JS トークン
> （`colors.ts`/`index.ts` 等）は削除し、Foundations の story/mdx も `tokens/` に co-locate
> （`states.stories.tsx` のみ product の Button/Input 依存のため product 残留）。

apps の globals.css は local `tokens/*` と `tailwind-theme.css` を foundations 参照に置換し、`theme.css` import は維持。

---

## Steps + Reversibility Table

| Step   | 内容                                                                                                                                                                                                                                                                             | 可逆性                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **S1** | `packages/design` → `packages/foundations` 改名（git mv）。`@dayopt/design`→`@dayopt/foundations` を全9参照で置換（package.json name / 3 deps / 2 tsconfig paths / preview.tsx / 2 globals.css の import / main.ts glob）。`pnpm install` で workspace 再リンク。typecheck/build | `[minutes]`（純粋改名・revert 容易）               |
| **S2** | foundations に無 prefix canonical token を実体化: product の `tokens/*.css`(6) ＋ `tailwind-theme.css` を foundations へ移設し、web 固有9 token を union として追記。foundations exports 追加                                                                                    | `[hours]`                                          |
| **S3** | apps を foundations 参照に切替: product/web の globals.css の local `tokens/*` ＋ `tailwind-theme.css` import を foundations import に置換し、local token CSS を削除。`theme.css` import は維持。storybook preview も foundations token を import                                | `[hours]`（視覚確認ゲート。ただし衝突0で低リスク） |
| **S4** | 仕上げ: storybook の Foundations stories が foundations を指すか確認、`pnpm build` 両アプリ、Playwright で主要画面の視覚確認                                                                                                                                                     | `[minutes]`                                        |

`[irreversible]` なし。

---

## Existing Code to Reuse

- `apps/product/src/lib/styles/tokens/*.css`（6, colors=279行）＋ `tailwind-theme.css` → foundations canonical の正
- `apps/web/src/styles/tokens/elevation.css` ほか web 固有9 token → union に取り込む
- `packages/design/src/theme.css` → そのまま foundations に温存（A体系）

---

## What I'm Not Doing

- `@dayopt/ui` / `lib/components/ui` / dialog 挙動 / `@dayopt/config` / eslint/tsconfig は一切触らない（スコープ外）
- `--dayopt-*`（A体系）の廃止はしない（components project へ）
- token 値の再設計はしない（union のみ。同値なので変化なし）
- 死蔵 token JS の削除は本 project の必須項目にしない（S2 で余力があれば、なければ保留）

---

## リスクと緩和

1. **視覚 regression** — 実測で同名異値 0。union で web 固有9を必ず取り込めば両アプリとも token は不変。S3/S4 後に Playwright で product/web 主要画面を確認
2. **Tailwind v4 の @import 順 / @theme 処理** — `@theme inline` は consuming app の Tailwind build が処理する。foundations の `tailwind-theme.css` を各 globals.css の正しい順序（primitives→tokens→@theme）で import。build で検証
3. **改名取りこぼし** — 全9参照をチェックリスト化（package.json name / 3 deps / 2 tsconfig paths / preview.tsx / 2 globals.css / main.ts glob）。`pnpm install`→`typecheck`→`build` 必須

---

## 検証ゲート

- `pnpm typecheck` / `pnpm lint` / `pnpm build`（product・web）
- Playwright で product / web の主要画面スクリーンショット（token 切替の視覚確認）
