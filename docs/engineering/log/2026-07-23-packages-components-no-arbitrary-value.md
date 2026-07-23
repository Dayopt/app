---
status: frozen
date: 2026-07-23
code: eslint.config.packages.mjs
---

# packages/components に tailwindcss/no-arbitrary-value を適用しない

`packages/components` の Tailwind arbitrary value 32 マッチ（実クラス使用 30 箇所 / 16 ファイル、残り 2 はコメント内言及）を棚卸しした結果、`no-arbitrary-value` ルールは packages には適用せず、無傷で置換できる 3 箇所のみ Tailwind 数値スケールへ寄せる判断をした。

## 背景・当時の前提

R-05（#1520 / PR #1678）で `packages/*` を ESLint ゲートに載せた際、`packages/components` には `apps/product` が使っている `tailwindcss/no-arbitrary-value` を適用しなかった。同時に `badge.tsx` / `scroll-area.tsx` の `eslint-disable-next-line tailwindcss/no-arbitrary-value` 2 行を素のコメントへ置換した（plugin 未導入のため rule 未定義エラーになるため）。#1679 はこの残課題として、rule 適用可否の設計判断を求めていた。

## 決定と理由

- `min-w-[8rem]`（`select.tsx:100` / `dropdown-menu.tsx:188`）と `min-w-[12rem]`（`dropdown-menu.tsx:30`）の 3 箇所は Tailwind v4 デフォルト数値スケール（`--spacing: 0.25rem`）で `min-w-32` / `min-w-48` に置換した。描画値は完全一致（32 × 0.25rem = 8rem、48 × 0.25rem = 12rem）で UI 変更なし。`packages/foundations/src/tokens/spacing.css` のコメントが「component は数値スケールを使う」方針を明記しており、これが正規の書き方。
- `tailwindcss/no-arbitrary-value` ルールは packages には適用しない。残り 27 箇所の arbitrary value は構造的に token 化不可:
  - transition 対象プロパティの指定（`transition-[color,box-shadow]` 等、値ではなくプロパティ名の列挙）
  - viewport / calc 単位（`max-h-[80vh]`, `max-w-[calc(100vw-2rem)]` — apps/product でも理由付き disable で運用中の同種パターン）
  - pseudo-element content（`content-[""]`）
  - grid template（`grid-rows-[0fr]`, `grid-cols-[1fr_auto]` — レイアウト構造の記述）
  - radix CSS 変数（`min-w-[var(--radix-select-trigger-width)]` — radix が実行時に注入する値）
- `rounded-[0.25rem]`（`logo.tsx:12`）と `translate-y-[-3px]`（`alert.tsx:7`）も対応 token が存在しないため置換しなかった。radius token 体系（`packages/foundations/src/tokens/radius.css`）は 0/8/16/full の 4 段階を意図的に採用しており 4px を含まない。`rounded-lg`（8px）へ寄せると `sm` サイズの見た目が変わるため不可。
- `@dayopt/components` は shadcn/radix 由来の primitive 層であり、rule を有効化すると残り 27 箇所すべてに理由付き `eslint-disable-next-line` が必要になる。apps/product 側は既に同種パターンで 28 箇所の disable を運用しており、packages にも同程度の disable を積み増しても lint 上の signal が増えるわけではなく、primitive 層のコードを恒久的に汚すだけと判断した。

## 却下した選択肢と、なぜ捨てたか

- **rule を有効化し、token 化できる箇所を寄せ、残りへ disable を付ける**: apps/product と運用が揃う利点はあるが、disable が約 20〜22 行 primitive 層に恒久増加する。将来 upstream（shadcn）との同期時に diff ノイズが増えるだけで、arbitrary value を減らす効果は token 化 3 箇所以外に無い。
- **無傷置換可能な min-w 3 箇所も含めて何もしない（適用外の追認のみ）**: `min-w-[8rem]` / `min-w-[12rem]` は Tailwind 標準スケールでそのまま書けるのに arbitrary 記法を残す理由がなく、コード品質として据え置く理由がない。

## 影響・やること

- `eslint.config.packages.mjs` に本判断をコメントとして明記済み（rule 追加は行わない）
- `badge.tsx` / `scroll-area.tsx` の素コメントは現状維持（rule 未適用のため disable へ戻すと `reportUnusedDisableDirectives: 'error'` で fail する）
- 将来 `packages/components` に新規 component を追加する際、arbitrary value の妥当性は lint ではなく code review で確認する
- radius / spacing token 体系を拡張する（4px token の新設など）話が別途持ち上がった場合は、この判断を再評価する
