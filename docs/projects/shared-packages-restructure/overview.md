# shared-packages-restructure — Project 全体設計書

策定日: 2026-06-19（plan-review 反映改訂: 2026-06-19）
規模: **大規模**（両アプリ横断 / 視覚 regression リスク / パッケージ改名 / import 全置換）
ブランチ: `storybook-cleanup`（出発点。フェーズごとに PR 分割）

> **改訂履歴**: 初版を plan-critic が HALT。指摘を反映し (1) build config 共有を別 project に分離（`@dayopt/config` 改名は撤回）、(2) canonical token を無 prefix（B体系）に確定し `--dayopt-*` 廃止の順序を安全化、(3) component 挙動差・cn/hook 単一正を明示。

---

## Goal

product / web が各自で重複保有している **デザイントークンと汎用UI** を `packages/` の共有レイヤーに引き上げ、両アプリが import する単一の正にする。

（build 設定の共有＝eslint / tsconfig base は **別 project `build-config-sharing`** に分離。本 project では扱わない。）

---

## 背景（検証済みファクト / 2026-06-19・plan-fact-checker 照合済み）

現状は「product が実質のデザインシステム本体・web が手動コピー・packages 層は死蔵/極薄」という二重管理。さらに **トークン体系が3つ並走**している（これが初版の致命的見落とし）。

### トークン体系（重要）

| 体系                       | 定義                                                                             | 参照法                                                    | 使用者                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A: `--dayopt-*` prefix** | `packages/design/src/theme.css`                                                  | `bg-[var(--dayopt-color-primary)]`（raw arbitrary value） | **packages/ui の4個だけ**（badge:9 / button:6 / card:2 / logo:5 行、計~22箇所） |
| **B: 無 prefix**           | `apps/*/tokens/colors.css` ＋ `@theme inline`（`apps/*/.../tailwind-theme.css`） | `bg-primary`（Tailwind utility, hover/dark variant 込み） | **app コンポーネント 64個全部**（product32＋web32）                             |

→ **canonical は B（無 prefix）に確定**。A は死蔵パッケージの自己完結ハックなので廃止する。

### その他のファクト

| 項目                   | 実態                                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@dayopt/design`       | 死蔵。`theme.css` の `--dayopt-*` は app 参照 0 件、token JS も未使用。ただし A体系として packages/ui が依存中（廃止には packages/ui 書き換えが前提）                                                                           |
| 本物のトークン         | product `lib/styles/tokens/*.css`（6: colors=279行/primitives/radius/spacing/states/z-index）と web `styles/tokens/*.css`（4: colors=226行/elevation/primitives/states）が別実体・乖離                                          |
| `@dayopt/ui`           | Button/Card/Badge/Logo/VisuallyHidden の5個。コード 25 箇所で import。独自 `cn`（`packages/ui/src/cn.ts`）                                                                                                                      |
| 本物の汎用UI           | product `lib/components/ui/*`（32）と web `components/ui/*`（32）が別実体・乖離。名前一致 **16個**: badge/button/card/dialog/dropdown-menu/input/label/radio-group/select/separator/sheet/skeleton/switch/tabs/textarea/tooltip |
| 挙動差の実例           | product `dialog.tsx` は `useIsMobile`+vaul で **mobile 時 Drawer 化**、web `dialog.tsx` は radix のみで Drawer 化しない（sheet も候補）                                                                                         |
| app 依存               | product `dialog.tsx` は `@/lib/hooks/useIsMobile` `@/lib/hooks/useHasMounted` `@/lib/utils` の cn に結合                                                                                                                        |
| `@dayopt/config`       | runtime 定数（domain/URL/brand）。36 箇所で import。**本 project では改名しない**（build config は別 project で慣用名 `@dayopt/eslint-config` 等を新設）                                                                        |
| Storybook story source | `apps/product/src` ＋ `packages/{design,ui}` ＋ `apps/storybook/docs` ＋ `apps/storybook/.storybook/stories`（4 source）。web は不在。packages/{design,ui} の story は前段 commit `f585b91b` で 0 件（glob は温存）             |

---

## 目標構造

```
packages/
  foundations/   # 無prefixトークン CSS（colors/primitives/radius/spacing/states/z-index/elevation）+ @theme inline。+ cn util
  components/    # 汎用UI（重複16個を起点に厳選）。foundations の @theme に依存
  config/        # ← 据え置き（runtime 定数。改名しない）
  assets / billing / database / domain / types   # 既存維持
```

- 両アプリは `foundations`（トークン＋@theme）と `components`（汎用UI）を import。
- `--dayopt-*`（A体系）と `@dayopt/design` は移行完了後に廃止。
- build 設定共有（eslint/tsconfig）は別 project `build-config-sharing`。

---

## Minimum Viable Approach

1. `@dayopt/design` → `@dayopt/foundations` 改名。無 prefix canonical token ＋ `@theme inline` を出す（product を superset として正、web を diff→reconcile）。**この時点では `--dayopt-*` theme.css を温存**（packages/ui がまだ使うため壊さない）
2. 両アプリの local token CSS を foundations 参照に置換
3. `@dayopt/ui` → `@dayopt/components` 改名。packages/ui の `--dayopt-*` className(~22) を `bg-X` utility に書き換え（foundations @theme に依存させる）。重複16個の正を集約。両アプリ import 置換
4. 不要になった `--dayopt-*` / `@dayopt/design` 残骸を削除、Storybook glob 更新

「ついで」で同時にやらない: トークン値の再設計 / UI リデザイン / app 固有コンポーネント移設 / build config 共有。

---

## フェーズ分割 + Reversibility Table

`--dayopt-*` の削除は **components が A体系から離脱した後**に行う（初版の「P2 で theme.css 削除→packages/ui の色全消失」事故を回避）。

| Phase                            | 内容                                                                                                                                                                                                                                                                                                                                                                               | 主リスク                                              | 可逆性                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| **P1 — foundations 確立**        | `design`→`foundations` 改名。無 prefix canonical token ＋ `@theme inline` を foundations から出す。product/web token を **diff レポート化→同名異値を reconcile**（既定 product）。両アプリ local token CSS を foundations 参照に置換。`cn` の単一正を foundations に置き app `@/lib/utils` は re-export。**`--dayopt-*` theme.css は温存**                                         | **視覚 regression（両アプリ）**。同名異値トークン統合 | `[hours]`〜`[days]`    |
| **P2 — components 確立**         | `ui`→`components` 改名。**packages/ui の `--dayopt-*` className(~22) を `bg-X` utility に書き換え**（A→B 離脱、foundations @theme 依存に）。重複16個を 1 個ずつ 3-way diff（API/visual/**挙動**）→ 挙動同型は集約、**挙動分岐（dialog/sheet 等）は集約対象から除外 or 明示的 UX 変更として記録**。app util/hook 依存は単一正へ。両アプリ 25+ import 置換。story を packages へ移設 | **視覚/挙動 regression**。impl 乖離・hook 結合        | `[days]`               |
| **P3 — 廃止 & Storybook 仕上げ** | A体系が無参照になったことを確認し `--dayopt-*` theme.css / 死蔵 `@dayopt/design` 残骸を削除。`main.ts` glob を foundations/components に更新。最終 dedup                                                                                                                                                                                                                           | 低（無参照確認後）                                    | `[minutes]`〜`[hours]` |

`[irreversible]` なし（公開 URL / DB schema / 外部契約に触れない。改名は git mv で履歴保持・revert 可能）。

---

## Existing Code to Reuse

- `apps/product/src/lib/styles/tokens/*.css`（6ファイル, colors=279行） → foundations の **無 prefix canonical token**
- `apps/product/src/lib/styles/tailwind-theme.css` の `@theme inline` → foundations の utility マッピング（product が superset: `bg-primary-hover` `bg-state-hover` 等を含む）
- `packages/ui/src/cn.ts` → foundations の単一 `cn`（app `@/lib/utils` はこれを re-export）
- `apps/product/src/lib/components/ui/*`（32個のうち汎用16個） → components の **正**
- `packages/design/src/{theme.css, tokens.ts}` の構造 → foundations の足場（中身は無 prefix に差し替え。`--dayopt-*` は P3 で破棄）

---

## What I'm Not Doing（scope creep 自己検出）

- **build config 共有はしない**: eslint/tsconfig base の共有は別 project `build-config-sharing`。`@dayopt/config`（runtime 定数）は改名せず温存（36 import 不変）。新設は慣用名 `@dayopt/eslint-config` / `@dayopt/tsconfig`
- **A体系（`--dayopt-*`）を canonical にしない**: 廃止する。B（無 prefix）に統一
- **app 固有コンポーネントの移設はしない**: calendar/entry/stats/mini-calendar、web の breadcrumb/command/pagination 等は各アプリに残す。`components` は共通16個に限定
- **挙動分岐コンポーネントの無断統合はしない**: dialog/sheet 等は挙動差を diff で検出し、除外 or 明示変更として扱う（web の暗黙 UX 変更を作らない）
- **トークン値の再設計・UI リデザインはしない**: 既存値の統合と className 体系の置換に限る
- **cn/hook の二重管理を再発させない**: packages に単一正を置き、app は re-export（複製しない）
- **全フェーズを 1 PR にしない**: P1/P2/P3 分割。P1/P2 に視覚確認ゲート
- **web を Storybook に追加しない**: ただし挙動差を残して集約する component が出た場合は検証 story を伴わせる（P2 判断と一体）

---

## リスクと緩和

1. **token 統合の視覚 regression（P1 最大）** — 着手前に product/web 全 token CSS を diff レポート化、同名異値だけ抽出→canonical 決定（既定 product）。web 専用 token は foundations 同梱（未使用なら無害）。実装後 Playwright で両アプリ主要画面を視覚確認
2. **A→B 離脱の取りこぼし（P2）** — `--dayopt-*` theme.css 削除（P3）は `grep -r "--dayopt-"` が 0 件になってから。packages/ui の~22箇所は対応する `@theme` utility が存在するか1つずつ確認（`warning-tint`/`info-tint`/`shadow-*` 等、B に対応 utility が無いものは foundations @theme へ追加）
3. **component 挙動差（P2）** — 16個を 1 個ずつ pipeline。3-way diff（API/visual/挙動）。挙動分岐は除外 or 明示記録。hook 結合（useIsMobile 等）を伴う component は、hook の単一正を決めるまで集約しない
4. **改名取りこぼし** — `package.json` name / `pnpm-workspace.yaml` / tsconfig paths / Storybook glob / turbo 依存をチェックリスト化。`pnpm typecheck` + `pnpm build` 必須ゲート

---

## 未決事項（着手前に詰める）

- **Q-A**: P1 の token 衝突で product canonical 時、web の見た目変化をどこまで許容するか（完全一致狙い vs web 変化許容）
- **Q-B**: `components` の境界 — 16個固定で始めるか、片側のみだが汎用なもの（web `breadcrumb`, product `confirm-dialog` 等）も初手に含めるか
- **Q-C**: `cn` の単一正は foundations / components のどちらに置くか（foundations 推奨＝最下層）
- **Q-D**: dialog/sheet など挙動分岐 component を「除外（app 残置）」か「product 挙動で統合＋web は意図的 UX 変更＋検証 story」か

---

## 参照

- 前段の Storybook 重複 story 削除: commit `f585b91b`（`packages/{ui,design}` の story 10本削除）
- 分離先 project: `build-config-sharing`（eslint/tsconfig base 共有。別途設計）
- workflow: [.claude/rules/workflow.md](../../../.claude/rules/workflow.md) / plan format: [.claude/rules/plan-format.md](../../../.claude/rules/plan-format.md)
