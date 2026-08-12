---
title: '#1701 Phase 1（Root Directory / Skip deployments）は #1817 に superseded された'
status: frozen
date: 2026-08-12
last_verified: 2026-08-12
issue: 1701
code:
  - apps/product/vercel.json
  - apps/web/vercel.json
  - scripts/ci/impact.mjs
  - scripts/production-config-audit.mjs
---

# #1701 Phase 1 は superseded（一部は実施禁止）

#1701「Vercel Pro 最適化」の Phase 1 は 2026-06 に起票された。その後 **#1817（ci-monorepo-refactor）が別の設計で同じ問題を解いた**ため、issue 本文の指示は現状と食い違っている。再着手時に本文どおり実行すると壊れる箇所があるので、実測と判断を残す。

## 何が変わったか（2026-08-12 実測）

| #1701 本文の記述                                     | 実際                                                                                | 確認方法                                                                       |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 両 Project の Root Directory は `./`                 | product=`apps/product` / web=`apps/web` に**移行済み**                              | `GET /v9/projects/{name}` の `rootDirectory`                                   |
| `apps/product/vercel.json` は存在しない              | **存在する**（PR #1784 で新設）。ルート `vercel.json` は削除済み                    | commit `aba133b4a`（PR #1799）                                                 |
| Ignored Build Step は使わず native skip を有効化する | **逆**。`ignoreCommand` が正本で native skip は常時無効が契約                       | `apps/*/vercel.json` の `ignoreCommand`、`scripts/production-config-audit.mjs` |
| web は `vercel.json` で `maxDuration: 30` を設定済み | どちらの `vercel.json` にも `functions` block は無い。各 route の静的 export が正本 | `apps/web/src/app/route-duration-contract.test.ts`                             |

Root Directory の移行そのもの（Phase 1 の主目的）は 2026-08-01 に完了している（[2026-08-01-vercel-root-directory-flip-product.md](./2026-08-01-vercel-root-directory-flip-product.md)）。

## 実施してはいけない 2 つ

### (a) 「Skip deployments を有効化」

`scripts/production-config-audit.mjs` の `auditProjectSettings` が `enableAffectedProjectsDeployments !== false` を failure として扱う。有効化すると:

- Production Config Audit が落ち、`pnpm branch:finish` の merge gate が全 PR で止まる
- native skip は **pnpm workspace の依存グラフを見ない**。`packages/**` だけを触る PR で「Impact Resolver は `product=true` と判定するのに Vercel は deployment を skip する」が起き、merge gate が永遠に来ない commit status を待つ

後者は 2026-08-04 のリスクレビューで検出済み（[ci-monorepo-refactor overview](../../projects/_archive/ci-monorepo-refactor/overview.md) §8 補足）。実測値は product=`false`、web=未設定（応答に現れない）で、**現状が正しい**。

なお #1701 本文が native skip を推した根拠（「Ignored Build Step は Deployment 生成後に判定されるので Deployment 数を減らせない」）自体は正しい。#1817 はこれを承知の上で、**依存グラフを正しく読めることの方を優先して** `ignoreCommand` を選んでいる。skip の判定精度と deployment 数のトレードオフで、精度を取った。

### (b) 「OAuth metadata / token rewrites を `apps/product/vercel.json` へ移す」

OAuth の 4 endpoint は既に **App Router の filesystem route** で、rewrite ではない:

- `apps/product/src/app/.well-known/oauth-authorization-server/route.ts`
- `apps/product/src/app/.well-known/oauth-protected-resource/route.ts`
- `apps/product/src/app/oauth/token/route.ts`（canonical。`api/oauth/token/route.ts` を re-export）

commit `aba133b4a` が、handler 削除済みの `/api/well-known/*` を指す stale rewrite を除去した。当時これは production の OAuth discovery を 404 にする直前の状態で、外部レビューが P1 として検出したもの。**rewrite を復活させるとその不具合を再導入する。**

rewrite に戻せない理由はもう 1 つある。**Preview host には production 用の host 条件付き rewrite が効かない**ため、rewrite 依存だと advertise した `tokenEndpoint` が Preview で 404 になる。filesystem route はどの host でも解決する。

実際には `scripts/__tests__/mcp-vercel-routing.test.ts` が「`.well-known` rewrite が無いこと」「ルート `vercel.json` が復活しないこと」を固定しているので、実行しても test で落ちる。

## Acceptance Criteria の扱い

#1701 の Phase 1 に属する AC は **チェックを外すのではなく文言を反転させて閉じる**。チェックを外すだけだと「やり残し」に見え、次の担当者がまた実施しようとする。

- 「両 Project でネイティブの Skip deployments が有効」→ **「native skip は無効のまま維持し、`ignoreCommand` が skip を担う」**
- 「`turbo-ignore` や Custom Ignored Build Step に依存していない」→ 現状は `vercel.json` の `ignoreCommand` に依存する形。Dashboard 側の Ignored Build Step が未設定であることは audit が担保している

## 教訓

長く open な issue の本文は、着手時点では**設計の前提ごと古びている**ことがある。#1701 は起票から着手まで約 2 か月あり、その間に別 issue が同じ問題を別解で解いていた。

**着手前に「issue が前提としている現状」を機械的に再検証する**のが安い。今回は `vercel.json` の存在確認と `GET /v9/projects/{name}` の 2 つで、本文の 4 箇所が古いと判明した。
