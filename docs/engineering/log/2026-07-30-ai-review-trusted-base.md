---
status: frozen
date: 2026-07-30
code: .github/workflows/ai-review.yml
---

# ai-review を pull_request_target + base revision へ移し、PR code に GEMINI_API_KEY を渡すのをやめた

## 背景・当時の前提

[2026-07-26 の決定](./2026-07-26-ai-review-pipeline.md)で作った ai-review は `pull_request` で発火し、
PR の head を checkout した working tree から `pnpm exec tsx scripts/ai-review/review.ts` を実行していた。
その process には `GEMINI_API_KEY`（課金付き）と `pull-requests: write` の `GITHUB_TOKEN` を渡していた。

[#1739](https://github.com/Dayopt/dayopt/issues/1739) は PR #1738 の Codex レビューを起点に立てた issue で、
`scripts/ai-review/review.ts` を書き換えた PR がレビュー前に鍵を持ち出せる点を指摘していた。
`persist-credentials: false` は git 認証情報を残さないだけで、env の secret は保護しない。

issue を立てた時点の前提は「`GEMINI_API_KEY` を repo secret に登録する前に対応する」だったが、
**secret は 2026-07-27 に登録済み**（[有料枠の決定](./2026-07-27-ai-review-free-tier-rejected.md)）で、
着手時点でリスクは既に実体化していた。

## 決定と理由

**`pull_request_target` + base revision の checkout へ移す。**
[production-config-audit.yml](../../../.github/workflows/production-config-audit.yml) と同型にした。

issue は「`pull_request` のまま `scripts/ai-review/` だけ base 版へ差し替えれば足り、
`pull_request_target` 化は必須ではない」と書いていたが、これは成立しない。GitHub docs の
`securely-using-pull_request_target` は、`pull_request` が
"runs the workflow file from the merge commit of the pull request"、`pull_request_target` が
"the workflow file itself still comes from the default branch" と明記している。つまり
`pull_request` では **workflow ファイル自体が PR の管理下**にあり、`.github/workflows/ai-review.yml` を
書き換えた PR は `${{ secrets.GEMINI_API_KEY }}` を直接持ち出せる。script だけ base 版にしても
1 行で迂回される。

同じ理由で `- uses: ./.github/actions/setup` も PR の管理下にあり、その
`pnpm install --frozen-lockfile` は root の `prepare` script と PR 編集可能な
`pnpm-workspace.yaml` の `allowBuilds` を、secret を持つ step と同じ runner filesystem 上で実行していた。
`pull_request_target` + base checkout はこの経路も同時に閉じる。

untrusted な PR diff は「データ」のまま扱う。`collectChanges` は `git diff base...head` しか見ず
working tree を読まないため、head は git object として到達できれば足り、checkout する必要が無い。
この部分は変更していない。

移植した先行実装の 4 ブロック:

- **base revision の checkout** — `ref: ${{ github.event.pull_request.base.sha }}`
- **contract-change 検出** — PR が `scripts/ai-review/**` または `ai-review.yml` を触っていたら
  check を落とす。rename で保護対象から逃げられないよう `previous_filename` も見る。
  trusted base 実行では PR 側の reviewer 変更はその run に影響しないが、マージすれば以後の
  全 PR の監査契約が変わる。2026-07-26 の「`prompt.md` の変更は専用 PR で行う」運用規律を機械化した
- **commit status の手動 publish** — `pull_request_target` の run は base SHA に紐づくため、
  PR の head SHA には check が付かない。`AI Review` という context で status を自分で POST しないと、
  `finish-branch.sh` の「失敗 0 件・実行中 0 件・成功 1 件以上」判定から gate が静かに消える
- **enforce の分離** — review の exit code を output に退避し、status publish 後に判定する

移植の過程で、`pull_request_target` 特有の踏み抜きを 3 つ塞いだ。いずれも
「レビューせずに green」に化けるクラスで、`pull_request` のままなら現れなかったもの。

- **concurrency group** — `github.ref` はどの PR でも base branch（`refs/heads/main`）になる。
  ref だけで group を作ると PR をまたいで cancel し合い、あとから走った PR だけがレビューされる。
  group に PR 番号を入れた
- **`AI_REVIEW_HEAD_SHA` の fallback** — `github.sha` は base 先端を指すため、fallback が効くと
  `base...base` の空 diff を「危険クラス 0 件」と読んで緑になる。fallback を外し、
  head SHA が未解決・未到達なら `git cat-file -e` で fail-closed にする step を足した
- **`if: always()`** — 打ち切られた run も `always()` なら status publish が走り、
  head SHA を**実行時点で引き直す**ため、新しい push の run が付けた success を古い run の
  failure が上書きしうる。`!cancelled()` にした

## 却下した選択肢と、なぜ捨てたか

- **`pull_request` のまま `git checkout "$BASE_SHA" -- scripts/ai-review/` を挟む**（issue の案） —
  上記のとおり workflow ファイル自身が PR 管理下なので、目的を満たさない。
  事故は減るが、意図した攻撃者には無効
- **`workflow_run` へ移す** — workflow 定義が default branch から読まれる点は同じだが、
  PR 番号と SHA を triggering run から引き回す配管が増え、job も 1 本増える。
  `pull_request_target` で足り、同 repo に動く先行実装がある
- **`GEMINI_API_KEY` を Environment + 承認ルールへ移す** — 危険クラス PR ごとに手動承認が要るため
  gate として使えない。`pull_request_target` の job は `environment:` を宣言できない制約もある
  （[infra.md](../infra.md) の `VERCEL_TOKEN` と同じ理由）
- **diff を GitHub API で取る** — `git diff` で足りる。300 file 上限や大きいファイルで patch が
  落ちる制約を新たに背負わない
- **`pnpm install` 側の hardening（`ignore-scripts` 等）を別途入れる** —
  base checkout で setup action も lockfile も base 版になるため、この経路は同時に閉じる

## 影響・やること

- **reviewer 自身を改善する PR は、その改善前のバージョンでレビューされる。** trusted base の
  意図どおりの挙動。加えて危険クラスを同時に触っている場合は contract-change 検出で check が赤くなり、
  意図的な確認を要求する
- **`AI_REVIEW_ENFORCE` は未設定 = blocking で稼働している。** `review.ts` は
  `process.env.AI_REVIEW_ENFORCE !== 'false'` を既定にしており、repo variable は未設定
  （`gh variable list` が空）。[2026-07-27 のログ](./2026-07-27-ai-review-free-tier-rejected.md)は
  「観察モード（`AI_REVIEW_ENFORCE` 未設定）のまま運用を開始する」と書いているが、その後
  既定が blocking へ反転したため、現在は成立していない。blocking のまま運用するか観察モードへ戻すかは
  誤爆の実績を見てから別途判断する（本決定では値を変えない）
- 実発火の確認は次に危険クラス path を触る PR で行う。ai-review 自身の変更は paths filter に
  入っていないため、この変更を載せた PR では発火しない。
  [#1715](https://github.com/Dayopt/dayopt/issues/1715) の migration PR が最初の live-fire になる
- 確認する観点: checkout step が base SHA を指しているか、`AI Review` status が PR の head SHA に
  付いているか、`pnpm branch:finish <PR番号> --dry-run` がその check を認識しているか
