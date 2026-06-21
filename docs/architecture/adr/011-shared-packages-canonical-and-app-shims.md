# ADR-011: デザインシステム共有レイヤー（packages を canonical、app は re-export shim）

> accepted（2026-06-22）

---

## コンテキスト

product / web がデザイントークンと汎用 UI を**各自で重複保有**し、手動同期していた。さらに実装が三重に並走していた：

- トークン: `apps/product/src/lib/styles/tokens/*` と `apps/web/src/styles/tokens/*` が別実体（手動コピーで乖離）。`@dayopt/design`（旧 packages）は死蔵
- 汎用 UI: `apps/product/src/lib/components/ui/*`（32 個・リッチ）と `apps/web/src/components/ui/*`（32 個・web 版）が別実体。`@dayopt/ui`（旧 packages）は 5 個の薄い別実装
- トークン体系も `--dayopt-*`（A 体系・packages 内ハック）と無 prefix（B 体系・app 内）が混在

import の現状:

- product の `lib/components/ui` は **barrel を持たず**、全て直接パス import（`@/lib/components/ui/button`、対象 92 ファイル）
- web の `components/ui/index.ts` は「Vercel build 回避のため barrel 禁止」方針で**空**。直接パス import（20 ファイル）

「どこが唯一の正か」が不在で、変更が両アプリに伝播せず、乖離が蓄積していた。

---

## 決定

共有デザインシステムを `packages/` に集約し、**packages が唯一の canonical 実装場所かつ export 入口**とする。app 側の既存ファイルは**実装を持たず re-export shim にする**。

```
packages/foundations  = トークン（無 prefix CSS + @theme）の canonical。export 入口
packages/components   = 汎用 UI の canonical 実装・正規 export 入口
apps/product/src/lib/components/ui/*  = 既存 import を壊さない re-export shim
apps/web/src/components/ui/*          = 既存 import を壊さない re-export shim
apps の index.ts barrel               = 作らない・使わない（web の方針と一致）
```

- **canonical 実装は product 版を採用**（リッチで設計システム本体のため）
- トークン体系は**無 prefix（B 体系）に一本化**。`--dayopt-*`（A 体系）は廃止
- 移行は段階的（component ごと）。app の直接パス import（112 箇所）は shim 化で**書き換え不要**

---

## 詳細

### レイヤーの役割

| レイヤー               | 役割                                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/foundations` | トークン定義（`tokens.css` アグリゲータ + per-token css + `@theme`）と Foundations docs。無 prefix が唯一の canonical 体系 |
| `packages/components`  | 汎用 UI の実装本体 ＋ named export の barrel（`src/index.ts`）。foundations の canonical トークンを参照                    |
| `apps/*/.../ui/*`      | `export { X } from '@dayopt/components'` の 1 行 re-export shim。既存の直接パス import を維持するための薄い層              |

### なぜ shim か（barrel 直し 1 箇所では済まない理由）

product は barrel 非保有・web は barrel 禁止方針で、両アプリとも直接パス import。よって統合の選択肢は (A) 112 箇所の import を `@dayopt/components` へ全書き換え、(B) 既存パスのファイルを re-export shim にする、の 2 択。**(B) を採用**：import 書き換えゼロ・実装重複ゼロ・可逆で、web の「直接パス import」方針とも整合する。

### canonical = product の含意

near-identical な component（label / separator 等）は web も実質同一のため shim 化で視覚変化なし。一方、product と乖離する component（dialog の mobile Drawer、tooltip 等）は web が product 版を採用するため**視覚 / 挙動変化**が入る。これらは個別に視覚確認を伴って移行する。

### app 依存の扱い

移植する component は app の `@/lib/*` 依存を packages 内に閉じる（cn は `@dayopt/components` の `cn`、dialog の `useIsMobile` 等の hook は packages へ単一ソース化）。二重管理を再発させない。

### 進捗（本 ADR 時点）

- ✅ foundations: 無 prefix canonical 化、`@dayopt/design`→`@dayopt/foundations` 改名、token/doc 集約、legacy `theme.css` 撤去まで完了（proven instance）
- ✅ `@dayopt/ui`→`@dayopt/components` 改名、className を canonical へ移行
- ⬜ components の per-component 移植（shim 化）— 本 ADR が確定する構造に沿って段階実施

---

## 結果

### メリット

- 共有要素の唯一の正が packages に定まり、変更が両アプリへ単一ソースから伝播する
- app の直接パス import を維持したまま実装を集約でき、112 箇所の書き換えと blast radius を回避
- 各ステップが git revert で戻せる可逆な移行になる

### トレードオフ

- 各 app に薄い re-export shim ファイルが残る（実装重複はゼロだがファイル数は残る）
- canonical = product のため、乖離 component では web に視覚 / 挙動変化が生じ、個別の視覚確認が要る
- per-component の移植作業（依存の packages 内閉じ込み、deps 追加）が必要

---

## 関連

- `docs/projects/shared-packages-restructure/overview.md` — 全体設計（foundations / components / config）
- `docs/projects/foundations-sharing/overview.md` — foundations 集約（完了分の詳細）
- `.claude/rules/feature-boundaries.md` — app 内 feature 境界（本 ADR は packages ↔ app 境界を扱う）
- ADR-002 — Feature-Sliced アーキテクチャ（app 内の層構造）
