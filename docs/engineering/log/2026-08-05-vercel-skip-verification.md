---
title: Vercel Ignored Build Step の受け入れ検証
status: current
last_verified: 2026-08-05
---

# Vercel Ignored Build Step の受け入れ検証（#1817 Phase 4）

この PR 自体が受け入れ条件の検証台になる。docs 配下 1 ファイルだけを変更しているため、
Impact Resolver の判定は `product=false` / `web=false` / `docsOnly=true` になる。

## 確認すること

1. product / web の preview deployment が **両方 skip** されること
2. skip 時に head SHA へ `Vercel – product` / `Vercel – web` の commit status が付くか
   （付かない場合、merge gate 側の扱いを infra.md §merge gate の記述どおり確認する）
3. `pnpm branch:finish` が unaffected な context 欠落を正常扱いして merge できること

## 実測（2026-08-05）

### 基準 SHA の意味を体感した点

最初の push（branch 作成直後）では両 project が build された。branch を **#1817 が main へ入る前**の
main から切っていたため、branch 側に `ignoreCommand` 自体が無かったのが理由。main を取り込んだ
merge commit も `apps/*/vercel.json` を含むので当然 build される。**skip を観測できるのは
「ignoreCommand を持つ成功 deployment」が基準になった後の docs-only push から**で、これは
`VERCEL_GIT_PREVIOUS_SHA` が「前回成功した build」である仕様の直接の帰結。

### 結果

（この直下に、docs-only push の観測結果を追記する）
