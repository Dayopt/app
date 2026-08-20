---
title: private 化を確定し CI を 4 層へ再設計する
status: frozen
date: 2026-08-20
code:
  - .github/workflows/ci.yml
  - .github/workflows/heavy-post-merge.yml
  - .github/workflows/integration.yml
  - .github/workflows/release.yml
  - .claude/rules/workflow.md
  - .claude/rules/orchestration.md
---

# private 化を確定し CI を 4 層へ再設計する（#2269 / #2273）

[2026-08-11 の決定ログ](./2026-08-11-codeql-disabled-and-visibility-decision.md)は「private 化は保留し、public を維持する」と結論した。本ログはこれを覆す。**リポジトリは 2026-09 に private 化する**（User 決定、2026-08-20）。検討の出自は [#2264](https://github.com/Dayopt/dayopt/issues/2264)。

## なぜ 2026-08-11 の決定を覆すか

2026-08-11 ログの決め手は算術だった: private 換算コスト ~17,000 分/月に対し Free 枠は 2,000 分/月で、88% の削減が要る。CodeQL・Docs Guard を全廃しても CI 単体が ~11,900 分を占めるため「CI 削減が完了したら private 化する」という条件が成立しない、という結論だった。

この試算は「private 化の駆動理由が事業上に無い」ことも理由に挙げていたが、2026-08-20 に User がその理由を持って private 化を決定した。算術上の課題（Actions 予算の圧迫）は解消されていないため、**private 化そのものと並行して CI のコスト構造を変える**必要がある。CI 4 層再設計（#2269）はその対応。

## GitHub Team プランの検討

現行の main ruleset（require PR / force push 禁止 / required checks / thread 解決必須、[2026-08-13 の inventory ログ](./2026-08-13-merge-gate-ruleset-inventory.md)参照）は org Free プランでは **public repo でのみ有効**で、private 化すると無効化される。Team プラン（$4/月/seat、現 1 seat）を検討する理由:

- ruleset が private でも有効のまま維持できる
- Actions 無料枠が 2,000 → 3,000 分/月 に増える

CI 4 層設計の予算前提は、Team プラン加入の有無で変わる。**プラン確定は private 化の実施時点で行う**（本ログは方針を記録するのみで、加入の実行は別途 `EXPLICIT AUTHORITY`〈実課金〉として扱う）。private 化実施時に検証すべき事項:

- ruleset 無効化の正確な挙動（無効化されるのか、それとも private では設定自体ができなくなるのか）
- Team プランの Actions 無料枠 3,000 分/月が実際に適用されるか

## CI 4 層再設計

private 化後の Actions 予算（Free: 2,000 分/月、Team: 3,000 分/月のいずれでも現行 CI 課金 ~11,900 分/月には遠く届かない）に耐えるため、per-PR の重量層（E2E / Web E2E / Integration Tests）を撤去し、main へのマージ後に検証する構成へ変える。

| 層  | タイミング             | 内容                                                                 | 実装                                                                                                  |
| --- | ---------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | draft push             | Static Checks / Unit Tests（Impact gate による docs-only skip 込み） | `.github/workflows/ci.yml`（無変更）                                                                  |
| 2   | ready                  | 層 1 と同一セット（重量層が層 3 へ移ったため、層 1・2 は事実上同じ） | `.github/workflows/ci.yml`（無変更）                                                                  |
| 3   | main push 後 + nightly | E2E / Web E2E / Integration Tests                                    | `.github/workflows/heavy-post-merge.yml`（新規）/ `.github/workflows/integration.yml`（トリガー変更） |
| 4   | promote 前             | release.yml 内の smoke（既存）+ 層 3 green を promote の前提条件に   | `.github/workflows/release.yml`（pre-flight step 追加）                                               |

### 層 1・2 の narrowing は MVP に含めない

issue 本文が理想形として挙げた「層 1 = typecheck + affected unit のみ」への narrowing は、affected-test（変更ファイルからテスト対象を逆引きする）判定基盤が無く、今回の blast radius（層の再配置）を超える。現状の Impact gate（docs-only 判定）で当面代替し、narrowing 自体は別 issue で扱う。

### 層 3 の設計

- `heavy-post-merge.yml`: `ci.yml` の旧 `e2e` / `web` job をそのまま移設（checkout / setup / playwright install / supabase start / test 実行 / artifact upload は無変更）。トリガーは `push: branches: [main]` + `schedule`（08:00 JST）+ `workflow_dispatch`。docs-only skip は行わない（push:main の頻度は PR push よりずっと低く、安全網としては毎回走らせる方が単純で壊れにくい）
- `integration.yml`: `pull_request`（`ready_for_review` 含む types、`paths` filter）から `push: branches: [main]`（同一 `paths`）+ `schedule`（06:45 JST）+ `workflow_dispatch` へ変更。draft 判定（`if: github.event.pull_request.draft != true`）は pull_request context が無くなるため撤去
- レーンのローカル影響 spec 実走義務（`.claude/rules/lane-protocol.md` §条件付き事前 E2E）が per-PR 検出の主力を引き継ぐ

### 層 4 の設計

`release.yml` の `release` job に、smoke 実行前の pre-flight step を追加した。target SHA に対する check-runs（`gh api repos/{owner}/{repo}/commits/{sha}/check-runs`）を取得し、層 3 の 3 check（`🎭 E2E Tests` / `🌐 Web Build & E2E` / `Integration Tests`）が全件 `conclusion=success` であることを要求する。`force`（break-glass）時は既存の smoke/audit skip と同様にこの gate もスキップする。同名 check-run が複数（再実行）ある場合は `started_at` が最新のものを代表とする。

## 指揮台への設定変更依頼（本 PR の merge 前提）

main ruleset（id 6790553）の required_status_checks から以下 2 件を除去する必要がある。`heavy-post-merge.yml` は push:main でのみ発火するため、除去しないと pull_request イベントでは永久に "expected" のまま残り merge 不能になる:

- `🎭 E2E Tests`
- `🌐 Web Build & E2E`

除去後の required checks（6 件）: `🔍 Static Checks` / `📦 Unit Tests` / `Production Config Audit` / `Vercel – product` / `Vercel – web` / `🛡️ docs & secrets guard`。`Integration Tests` は元から required_status_checks に含まれていなかったため、この変更は不要。

この設定変更はレーンでは実行できない（GitHub Settings 操作）。指揮台の merge シーケンス（`.claude/rules/orchestration.md` §指揮台の merge シーケンス）の中で実行を依頼する。

## 影響を受ける既存規約

- `.claude/rules/workflow.md` §2 段階 CI / §Actions 経済の規律 — 4 層構造・private 化前提の反転を反映
- `.claude/rules/orchestration.md` §レーン主導の push・ready 化 のトレードオフ注記（「public repo 維持でrunnerコストは待ち時間のみ」は層3分離後は成立しないため改訂）/ §追従とマージ順の采配 の「public repo 維持（2026-08-11決定）」参照

## 却下した選択肢

**self-hosted runner の導入**: private 化後は fork PR リスクが無くなるため選択肢に入るが、超過課金（$0.008/分）と並ぶ「逃げ道」として記録のみに留める。1 か月実測後、Actions 課金の実態を見てから判断する（本ログ・issue の scope 外）。

## 影響・やること

- [x] `heavy-post-merge.yml` の新規作成、`ci.yml` からの e2e/web job 撤去
- [x] `integration.yml` のトリガー変更
- [x] `release.yml` への層 4 pre-flight step 追加
- [ ] **User 操作**: main ruleset の required_status_checks から E2E Tests / Web Build & E2E を除去（指揮台が merge シーケンス内で実行）
- [ ] private 化実施時: ruleset 無効化の挙動と Team プラン加入の要否を再検証する
