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

結果は merge 後にこのファイルへ追記する。
