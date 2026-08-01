---
title: Vercel product の Root Directory 移行（#1701 Phase 1 / 2 段目）実施ログ
date: 2026-08-01
status: frozen
---

# Vercel product の Root Directory 移行（#1701 Phase 1 / 2 段目）

PR #1784（1 段目: `apps/product/vercel.json` 新設）の merge 後、Vercel Dashboard で `product` project の設定を変更した。実施者は Claude セッション（ユーザーの明示指示による。Chrome のログイン済みセッション経由で Dashboard を操作）。

## 変更内容

| 設定                                            | 変更前     | 変更後         |
| ----------------------------------------------- | ---------- | -------------- |
| Root Directory                                  | `./`（空） | `apps/product` |
| Skip deployments (no changes to root directory) | Disabled   | **Enabled**    |

変更後にページを再読込し、両設定の永続化を確認した。

## 前提条件 3 点の確認結果（PR #1784 記載）

1. **`.vercelignore`**: ルートの `.vercelignore` のみ存在（`apps/product/.vercelignore` は無し）。`web` が同構成で正常稼働している先行事例に従い、flip 後の deployment のファイル数・build 時間で確認する（未実施 → 下記「残検証」）
2. **Include source files outside of the Root Directory**: flip 前から Enabled で、flip 後も Enabled を維持していることを確認した
3. **Ignored Build Step**: flip 直後に再読込して確認。`Automatic` のまま（Vercel による `turbo.json` 検出時の自動設定は発生しなかった）

## 残検証（次の deployment / テスト PR で行う）

- [ ] apps/product に触れる push の Preview / Production build が新 Root Directory で成功する（`apps/product/vercel.json` の crons / rewrites が有効になることを含む）
- [ ] deployment のファイル数・build 時間が悪化していない（前提 1 の後追い確認）
- [ ] **Skip deployments と required check `Vercel – product` の干渉**: `apps/product` に触れない PR（docs のみ等）で deployment が skip された時、commit status がどう付くかは Vercel docs に明記が無い（`vercel.deployment.skipped` イベントの存在は確認）。status が付かない場合、`infra.md` §merge gate の required checks により該当 PR が merge 不能になる。**最初の非 product PR で必ず確認し、block されたら Skip deployments のみを Disabled に戻す**（Root Directory は維持でよい）
- [ ] 両検証の完了後、ルート `vercel.json` を削除する（PR #1784 に記載の次段）

## ロールバック

Dashboard で Root Directory を空へ戻し Skip deployments を Disabled にすれば、ルート `vercel.json` を読む旧構成に数分で戻る（ルート `vercel.json` は本時点で未削除のため flip 前と完全に同一の状態に戻せる）。build 失敗時は既存の Production deployment が生き続けるため、ユーザー影響は出ない。

## 対象外

- `web` project の Skip deployments 有効化は #1701 の計画に含まれるが、今回の指示は `product` のみのため未実施。product 側で skip × required check の挙動を確認してから適用する方が安全
