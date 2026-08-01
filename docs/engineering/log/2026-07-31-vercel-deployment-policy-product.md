---
status: frozen
date: 2026-07-31
---

# Vercel Deployment Policy を product にも適用し、enforcement が効くことを確認した

[2026-07-24 の記録](2026-07-24-vercel-deployment-policy-applied.md)で「`web` に適用したが enforcement が働かない」としていた件の後続。`product` にも同じ policy が入っていることを確認し、REST API からの deployment が両 project で `BLOCKED` になることを実地で確認した。7/24 時点の「enforcement 未確認」は解消した（#1604）。

---

## 確認した状態

`GET /v9/projects/{web,product}` の `deploymentPolicy` を比較したところ、**両者は完全に一致**していた。

- Git Sources: GitHub `Dayopt/dayopt` のみ（Production / Preview）
- Deployment Sources: `git` のみ（Production / Preview）

7/24 の記録では `product` は未適用だったため、その後に適用されたことになる。適用経路の記録は残っていない。念のため `web` の `deploymentPolicy` JSON を正として `PATCH /v9/projects/product` を再適用し、再取得で一致と永続化を確認した（`rootDirectory` / build 設定に巻き込み変更なし）。

Team object（`GET /v2/teams/...`）に policy 相当のフィールドは無く、この policy は **project 単位の設定**であってチーム継承ではない。

## 正規経路が生きていること

適用時点の直近 deployment は、`web` / `product` とも GitHub 起点で READY。

- Preview: `claude/workflow-worktree-guidance` ほか（`source=git`）
- Production: `main`（`source=git`、2026-07-30）

policy 下で PR Preview と main merge の Production build は止まっていない。

## enforcement 再テスト: 今回は効いた

`POST /v13/deployments`（inline files、`target` 省略 = preview）を `web` / `product` の両方へ試行した。

| 挙動                    | 結果                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| HTTP status             | `200`（deployment record は作成される）                                    |
| `readyState` / `status` | **`BLOCKED`**                                                              |
| `errorLink`             | `https://vercel.com/docs/deployments/deployment-policy#deployment-sources` |

**拒否の形は「作成そのものの失敗」ではなく「作成された deployment を BLOCKED にして build させない」**だった。7/24 に「作成に成功した」と記録したのはこの形を成功と読んだ可能性がある。今回は `errorLink` が deployment-policy の docs を直接指しており、policy による遮断と断定できる。BLOCKED は build が走らないため、build 時間の課金も発生しない。

作成された test deployment 2 件は即削除し、`GET` が `not_found` を返すことを確認した。

- `dpl_CTTnKuuA6xeRGyToaYV45abvrj4W`（web）→ DELETED → not_found
- `dpl_CLXdncwGH4GP9DiG4MZhKjqqNrUF`（product）→ DELETED → not_found

なお `target: "preview"` は `POST /v13/deployments` では `400`（`'production' / 'staging' / custom environment identifier` のみ受理）。preview を狙う場合は `target` を省略する。

## CLI 経路の棚卸し

`.github/workflows/` に `vercel` CLI の呼び出しは**無い**。CI は `VERCEL_TOKEN` + `VERCEL_TEAM_ID` を node script へ渡し、`api.vercel.com` を直接叩く。

- `scripts/production-release.mjs`: `GET /v13/deployments/{id}`（読み取り）と `POST /v10/projects/{id}/promote/{deploymentId}`。**新規 deployment を作成しない**ため policy と衝突しない
- `scripts/production-config-audit.mjs`: `GET /v10/projects/{name}/env`（読み取りのみ）

repo に `vercel` パッケージ依存は無い。root `package.json` の CLI 利用は次の 2 つだけで、いずれも env 読み取り用の手元コマンド。deployment を作成しないため policy の影響を受けない。

- `vercel:env` → `vercel env ls`
- `vercel:env:pull:unsafe` → `vercel env pull ... --environment preview`

非対話実行される CLI 経路は無い。

## 残る限界

- enforcement は「BLOCKED にする」形であり、**deployment record 自体は作成される**。record 数や API 呼び出しを 0 にするものではない
- 7/24 との差が Vercel 側の enforcement 実装進展によるものか、当時の判定誤りかは切り分けできていない
- `product` の Preview に `source=redeploy` の READY deployment（2026-07-30）が残っている。redeploy が git 由来 deployment の再実行として許可されるのか、policy 適用前の実行なのかは未確認

関連 issue: #1604
