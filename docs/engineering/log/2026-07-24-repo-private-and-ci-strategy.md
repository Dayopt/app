---
status: frozen
date: 2026-07-24
code: .github/workflows/ci.yml
---

# repo を private 化し、失われた強制機能をローカルゲートで代替して CI を 4 job に絞った

## 背景・当時の前提

repo を public で運用していたが、`docs/` 配下が事業情報（顧客フィードバック、価格判断、
マーケ計画、障害記録）を含むまでに育っていた。一方で public であることの恩恵は実質ゼロだった。
外部 contributor は来ておらず、solo 開発で PR も内部レビューだけで回っている。

private 化には CI 課金が付いてくる。public repo の Actions は無料だが、private repo は
Free plan で月 2,000 分の枠があり、**job ごとに 1 分単位で切り上げ**られる。当時の構成は
CI 11 job + Docs Guard 4 job で、PR 1 本あたりの固定費が大きかった。

同時に、private + Free plan では **GitHub 側の branch protection と required check が強制されない**。
public 時代に効いていた強制機能がそのまま消える。

本ログは 2026-07-24 の private 化（[#1732](https://github.com/Dayopt/dayopt/pull/1732)）と
翌日の up-to-date gate 化（[#1735](https://github.com/Dayopt/dayopt/pull/1735)）の判断を記録する。
当時この一連の判断は commit message と YAML の inline コメントにしか残っておらず、
[2026-07-26 のログ](./2026-07-26-pr-granularity-actions-cost.md)がその欠落を指摘していた。
本ログでその穴を埋める。

## 決定と理由

**private 化し、Free plan を維持し、失われた強制機能はローカルゲートで代替する。**

private 化の理由は `docs/` の事業情報。public の恩恵がゼロである以上、情報を出し続ける理由が無い。

Free plan を維持したのは、Team plan（$4/user/月）が増やすのは Actions 枠と branch protection だが、
solo では前者は最適化で足り、後者は下記の代替で足りると判断したため。

**失われた強制機能の代替:**

- **main への直接 push 禁止** → [`.husky/pre-push`](../../../.husky/pre-push)。
  branch protection が効かないため、この hook が唯一の main 保護になる
- **required check の強制** → [`scripts/git/finish-branch.sh`](../../../scripts/git/finish-branch.sh) の 3 ゲート。
  「失敗 check 0 件」「実行中 check 0 件」「成功 check 1 件以上」をマージ前に自分で確認する。
  3 つ目が要るのは、check が 1 本も走っていない PR を前 2 つの条件では green と区別できないため
- **secret scanning / push protection** → 既存の gitleaks + `pnpm secrets:check`（Docs Guard 内）。
  private 化で新たに失ったものではなく、元から自前で持っていた

**CI 課金の最適化:**

- CI を 11 job → 4 job に統合（static / e2e / build&test / web）。checkout + setup の重複を削る。
  **実行コマンドは 11 job 構成と同一**で、検証内容は減らしていない
- Docs Guard を 4 job（docs-checks / docs-reminder / gitleaks / secrets-check）→ 1 job の逐次 step に統合。
  quality-gate aggregator は廃止
- Dependabot を monthly に間引く（PR ごとにフル CI が走るため）。security update は
  schedule と無関係に即時 PR が出るので、緊急性のある更新は落ちない
- **main への push で CI を走らせるのをやめた**（#1735）。代わりに `branch:finish` に
  up-to-date gate を入れ、「branch が main の最新を含み、その状態で CI green」をマージ前に強制する。
  マージ後の main は常に PR で検証済みの tree と一致するため、事後に main で再検証する意味が無い。
  **事後検出から事前防止への切り替え**であって、検証の削除ではない

**コスト方針:** 通常月は無料枠内（$0）。AI を並行させたバースト月は最適化後でも
~3,000 分に達する見込みで、超過分は $0.008/分なので月 ~$10 を許容する。

## 却下した選択肢と、なぜ捨てたか

- **Team plan へ上げる** — 増えるのは Actions 枠と branch protection。solo では前者は最適化で足り、
  後者は pre-push hook + `branch:finish` の 3 ゲートで代替できる。$4/user/月 を払う対価が無い
- **セキュリティ add-ons（GitHub Advanced Security / CodeQL）** — private repo では有料に加え、
  PR ごとの Actions コストも増える。既存の gitleaks + `secrets:check` + `pnpm check` で
  現状の検出層は足りている（[2026-07-21 のログ](./2026-07-21-github-code-quality-disabled.md)と同じ判断軸）
- **self-hosted runner** — Actions 分を無料にできるが、マシンの管理・セキュリティ・可用性を
  自分が負う。solo で月 ~$10 を避けるために常時稼働の runner を面倒見るのは逆算が合わない
- **検証内容を削って job を短くする** — 課金分は job 数の切り上げが支配的で、
  1 job の秒数を削っても課金分は変わらないことが多い。検証を削るのは最後の手段

**この時点で「却下」と考えていたが、その後採用した案が 2 つある。**
どちらも 2026-07-25 の実測（[2026-07-26 のログ](./2026-07-26-pr-granularity-actions-cost.md)が正本）で
前提が変わったため、そちらを後継の記録とする。

- **PR を大型化して run を減らす** — 当時はレビュー性を損なうとして退けた。実測で
  「コストは push 回数ではなく PR 本数にほぼ比例」「PR 1 本 ≈ 44 課金分」「並行 PR N 本で
  追加 CI が O(N²)」が分かり、束ねるのが既定になった（`.claude/rules/workflow.md` §PR 粒度）
- **docs-only の `paths-ignore`** — 当時は「docs も検証対象」として退けた。現在は
  [`ci.yml`](../../../.github/workflows/ci.yml) に入っている。`paths-ignore` は変更ファイルが
  _全て_ 該当した時だけ skip し、Docs Guard は paths filter を持たず全 PR で走るため、
  docs の検証自体は落ちない

## 影響・やること

- **マージは必ず `pnpm branch:finish <PR番号>` 経由**にする。GitHub UI の Merge ボタンは
  up-to-date gate を通らないため、事前防止方式の前提が崩れる
- **ユーザー作業: Actions spending limit を設定する。** github.com → Dayopt org →
  Settings → Billing and licensing → Spending limits → Actions で、既定の $0 から
  $10〜15/月 へ変更する。$0 のままだと無料枠 2,000 分に達した時点で Actions が停止し、
  バースト月に CI が丸ごと止まる。設定値は本ログの凍結後に変わりうるため、ここには残さない
- 課金の実測とコスト最適化の主レバーは [2026-07-26 のログ](./2026-07-26-pr-granularity-actions-cost.md)が正本。
  数値をここに複製しない
