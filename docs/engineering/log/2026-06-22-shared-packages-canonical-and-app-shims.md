# ADR-021: デザインシステム共有レイヤー（packages を canonical、app は直接 import）

> accepted（2026-06-22）

> 改訂履歴: 初版は移行手段として「app = re-export shim」を採用したが、最終形は
> **app の import を `@dayopt/components` に全書き換えして shim を廃止**する方針に更新（同 2026-06-22）。
> shim は import 書き換え前の経由地として使い、Phase 2 で全廃した。

---

## コンテキスト

product / web がデザイントークンと汎用 UI を**各自で重複保有**し、手動同期していた。さらに実装が三重に並走していた：

- トークン: `apps/product/src/lib/styles/tokens/*` と `apps/web/src/styles/tokens/*` が別実体（手動コピーで乖離）。`@dayopt/design`（旧 packages）は死蔵
- 汎用 UI: `apps/product/src/lib/components/ui/*`（32 個・リッチ）と `apps/web/src/components/ui/*`（32 個・web 版）が別実体。`@dayopt/ui`（旧 packages）は 5 個の薄い別実装
- トークン体系も `--dayopt-*`（A 体系・packages 内ハック）と無 prefix（B 体系・app 内）が混在

「どこが唯一の正か」が不在で、変更が両アプリに伝播せず、乖離が蓄積していた。

---

## 決定

共有デザインシステムを `packages/` に集約し、**packages が唯一の canonical 実装場所かつ export 入口**とする。app は `@dayopt/components` / `@dayopt/foundations` から直接 import する（shim は残さない）。

```
packages/foundations  = トークン（無 prefix CSS + @theme + Foundations docs）の canonical・export 入口
packages/components   = 汎用 UI の canonical 実装・正規 export 入口（単一 barrel）
  src/{category}/  = category 別整理（export は index.ts 単一 barrel。第二階層 category は [ADR-022](./2026-06-23-component-taxonomy.md) で責務ベースに精緻化）
  src/hooks/                                        = component が必要とする hook（useIsMobile 等）を自己完結化

apps/product/src/components/  = product 全体固有（旧 lib/components。common/shell/残置 ui）
apps/web/src/components/      = web 全体固有（content/seo/errors/web 固有 ui）
app の index.ts barrel        = 作らない・使わない（web の方針と一致）
```

- **canonical 実装は product 版を採用**（リッチで設計システム本体のため。両アプリにある場合）。片側のみ汎用なものはそのアプリ版を採用
- トークン体系は**無 prefix（B 体系）に一本化**。`--dayopt-*`（A 体系）は廃止
- app の `ui/X` への直接パス import（product 119 / web 50）は **`@dayopt/components` に全書き換え**し、移植済み app ファイルは削除
- app/feature 固有・i18n 結合の強いもの（product の avatar/toast/confirm-dialog/destructive-form-dialog/mini-calendar、web の search-input/tag-pill 等）は app に残す

---

## 詳細

### レイヤーの役割

| レイヤー                | 役割                                                                                                 |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/foundations`  | トークン（`tokens.css` + per-token css + `@theme`）と Foundations docs。無 prefix が唯一の canonical |
| `packages/components`   | 汎用 UI の実装本体（category 別）＋ 単一 barrel（`src/index.ts`）。foundations の token を参照       |
| `apps/*/src/components` | 各アプリ固有の component（共有しないもの）                                                           |

### 移行手段としての shim（経由地）

product は barrel 非保有・web は barrel 禁止方針のため、両アプリとも直接パス import。移行は (1) 移植先 packages を整備しつつ app ファイルを一時的に `export { X } from '@dayopt/components'` の re-export shim にして既存 import を保ち、(2) 最後に app の import を `@dayopt/components` へ全書き換えして shim を削除、という 2 段で進めた。最終的に shim は残さない。

### app 依存の閉じ込め

移植 component は app の `@/lib/*` 依存を packages 内に閉じる（cn は `@dayopt/components` の `cn`、dialog の `useIsMobile`/`useHasMounted`/`useMediaQuery` は `packages/components/src/hooks` に自己完結化。app レベルの breakpoints には依存させずメディアクエリを inline）。

### canonical = product の含意

near-identical な component は視覚変化なし。product と乖離する component（dialog の mobile Drawer、tabs の pill→underline、各種 elevation/radius/cursor の design 準拠化など）は web が product 版/design 準拠に収束するため**視覚・挙動変化**が入る。pre-launch のため許容し、視覚確認で sign-off する。

### 実施フェーズ

- **Phase 1**: foundations 確立（無 prefix 化・`@dayopt/design`→`@dayopt/foundations`・legacy theme.css 撤去）／`@dayopt/ui`→`@dayopt/components` 改名・className canonical 化／packages/components の category 化と全共有 component の移植
- **Phase 2**: app の import を `@dayopt/components` へ全書き換え＋移植済み app ui を削除（shim 廃止）
- **Phase 3**: product `lib/components` → `src/components` 移設（web と配置を統一）
- **Phase 4**: 本 ADR 更新・全 build・視覚確認

---

## 結果

### メリット

- 共有要素の唯一の正が packages に定まり、変更が両アプリへ単一ソースから伝播する
- app から `@dayopt/components` の単一 barrel を import する一貫した形になり、ui の所在が明確
- product/web の component 配置（`src/components`）が揃う

### トレードオフ

- import 全書き換え（約 170 サイト）と移植の blast radius が大きい（pre-launch のため許容）
- canonical = product のため乖離 component で web に視覚・挙動変化が生じ、視覚確認が要る
- i18n 結合の強い component は当面 app 残置（将来 props 注入で共有化の余地）

---

## 関連

- `docs/projects/shared-packages-restructure/overview.md` — 全体設計（foundations / components / config）
- `docs/projects/foundations-sharing/overview.md` — foundations 集約（完了分の詳細）
- `~/.claude/plans/crispy-snuggling-pebble.md` — components 共通モジュール化の実行 plan
- `.claude/rules/feature-boundaries.md` — app 内 feature 境界（本 ADR は packages ↔ app 境界を扱う）
- [ADR-012](./2026-02-26-feature-sliced-architecture.md) — Feature-Sliced アーキテクチャ（app 内の層構造）
