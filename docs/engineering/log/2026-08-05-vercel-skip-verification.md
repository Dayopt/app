---
title: Vercel Ignored Build Step の受け入れ検証
status: frozen
date: 2026-08-05
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

docs-only push（`e81b4fdc7`）の head SHA に対する commit status:

```
Vercel – web      success  "Canceled by Ignored Build Step"
Vercel – product  success  "Canceled by Ignored Build Step"
```

**確認できたこと**:

1. **両 project とも build を実行せずキャンセルされた**（受け入れ条件 1 を満たす）
2. **skip 時も commit status は `success` で付く。** これで [infra.md §merge gate](../infra.md) に
   「未確定・付かない場合は復旧手順が要る」と書いていた懸念が解消した。**「PR 全体では affected
   だが最終 push だけ unaffected（レビュー対応の docs 修正など）」でも head に context が付くため、
   merge gate は止まらない。** merge gate 側への fallback 実装は不要
3. 受け入れ条件 3（unaffected な context 欠落を正常扱いして merge できること）は、**そもそも
   context が欠落しない**ことが分かったため、この PR の merge 自体では検証対象にならない。
   Impact Resolver 側の affected 判定と Vercel の skip 判定が食い違った場合の fail closed は
   `scripts/__tests__/finish-branch.test.ts` が固定している

**Production Release との関係**: `VERCEL_ENV=production` の build は skip しない実装なので、
main への merge が作る candidate は常に存在する（[overview §8 実施形態](../../projects/ci-monorepo-refactor/overview.md)）。
2026-08-05 の #1835 merge では Auto-assign 無効化後の初 promote が `Production serves this commit`
で成功しており、release 経路への悪影響が無いことも同時に確認できた。
