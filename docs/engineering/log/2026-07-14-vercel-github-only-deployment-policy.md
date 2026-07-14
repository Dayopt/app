---
status: current
updated: 2026-07-14
---

# Vercel deploy は Dayopt/dayopt の GitHub 連携に限定する

## 背景・当時の前提

Dayopt の `product` / `web` は GitHub repository `Dayopt/dayopt` に接続し、Preview は feature branch / PR、Production は `main` から作成している。
2026-07-14 時点で Deploy Hook と Vercel Marketplace resource はなく、直近の Preview / Production deployment も GitHub 起点だった。

Vercel Deployment Policies は Git、CLI、REST API、Deploy Hook、Marketplace integration、v0 を環境別に許可制にでき、Git provider の organization / repository も限定できる。

## 決定と理由

Preview / Production の新規 deployment source は `Dayopt/dayopt` の GitHub 連携だけを許可する。

- Preview は branch push / PR による通常の確認を維持する
- Production は `main` merge からの自動 deployment を正規経路にする
- CLI、REST API、Deploy Hook、Marketplace integration、v0 からの新規 deployment は許可しない
- 正常な既存 deployment を `Promote to Production` する緊急 rollback は、新規 build を作らない復旧操作として維持する

## 適用状況

Vercel API で `web` を canary にして policy を適用しようとしたが、team `Dayopt` の実契約は Hobby で、
`Deployment policies are not available for Hobby, upgrade to Pro or Enterprise` と `403` が返った。
project の `deploymentPolicy` は変更前後とも `null` で、`product` には適用していない。

したがって、この方針は現在 Vercel 側では強制されていない。現行の代替統制は次のとおり。

- 両 project の接続先は `Dayopt/dayopt`、Production Branch は `main`
- `gitForkProtection` は有効
- Deploy Hook と Marketplace resource は未作成
- GitHub `main` は `Quality Gate` を required status check にしている
- 通常運用では CLI / REST API / Redeploy による新規 Production deployment を行わない

## 次の適用条件

Vercel を Pro または Enterprise に変更する判断が別途行われた時に、次を実施する。

1. `web` の Preview / Production に GitHub `Dayopt/dayopt` だけを許可する
2. PR Preview が作成されることを確認する
3. `product` に同じ policy を適用する
4. PR merge から両 project の Production deployment が成功することを確認する
5. CLI / REST API / Deploy Hook / Marketplace integration / v0 が拒否されることを確認する

関連 issue: #1604
