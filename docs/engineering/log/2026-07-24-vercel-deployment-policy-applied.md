---
status: frozen
date: 2026-07-24
---

# Vercel Deployment Policy を web に適用したが enforcement は未確認

## 背景

[2026-07-14 の決定](2026-07-14-vercel-github-only-deployment-policy.md)で、Preview / Production の新規 deployment source を GitHub `Dayopt/dayopt` だけに限定する方針を確定した。当時は Hobby プランで 403 が返り適用できなかった。2026-07-24 に Pro へ移行したため適用を再開した（#1604）。

## 実施内容

`web` を canary として、`PATCH /v9/projects/web` で project override の policy を適用した。

- Git Sources: GitHub `Dayopt/dayopt` のみ（Production / Preview）
- Deployment Sources: `git` のみ許可。CLI / REST API / Deploy Hooks / Marketplace / v0 は不許可（Production / Preview）
- 適用前の `deploymentPolicy` は `null`（web / product とも）。`product` は未適用

適用後、API の再取得と dashboard（Build and Deployment 設定）の両方で、ルールが Override として保存されていることを確認した。

## 判明した問題: enforcement が働かない

拒否経路の実地テストとして、REST API（`POST /v13/deployments`）から `web` への deployment 作成を試行した。

- `gitSource` 付き・inline files ベースの両方で、適用直後〜約 10 分後まで計 4 回、**すべて作成に成功してしまった**（作成された test deployment は毎回即削除済み）
- dashboard 上でルールは保存済み表示。公式 docs には「ルールは保存されていても enforced とは限らない」という記述があるが、enforce / pause を切り替える UI・API は確認できなかった
- Deployment Policies は Beta 表示であり、enforcement 側の実装ギャップの可能性が高い

## 決定

1. `web` の policy は**残す**。設定は無害で、Vercel 側の enforcement が有効になった時点で防御が効き始める
2. policy 下で git 経由の正常経路（PR Preview / main merge の Production build）が止まらないことを確認した後、`product` にも同じ policy を適用して設定を揃える
3. #1604 は「適用済み・enforcement 未確認」として open のまま維持し、後日再テストする。Vercel の Beta 進捗次第で support への問い合わせを検討する

## 現時点の実効的な統制

enforcement が未確認のため、実効的な防御は従来どおり以下に依存する。

- VERCEL_TOKEN は 2026-07-24 に rotation 済みで有効 token は 1 本のみ（#1558）
- `gitForkProtection` 有効、Deploy Hook / Marketplace resource なし
- GitHub `main` の required checks と Production Release gate（#1667）

関連 issue: #1604
