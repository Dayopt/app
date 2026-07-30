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
- **enforce の分離** — review の exit code を output へ退避し、contract 判定と合わせて最後に落とす。
  review step が skip された経路では output が空になるため、既定を `1` にして fail-closed へ倒す

**commit status の手動 publish は移植しなかった。** 移植元がそれを持つ理由を
「`pull_request_target` の run は base SHA に紐づくので PR に check が出ない」と推定して一度実装したが、
これは誤りだった。2026-07-30 に [PR #1760](https://github.com/Dayopt/dayopt/pull/1760) の
`statusCheckRollup` を実測すると、`production-config-audit.yml` の job が
`Audit Vercel metadata (trusted)` という **CheckRun として出ていた**。`pull_request_target` でも
job の check run は PR に出る。したがって gate は job の exit code のままで足り、
`statuses: write` も status publish step も要らない。

この確認をしたことで、逆に status publish 方式のほうが弱いことも分かった。status を唯一の痕跡にすると、
run の cancel や job timeout で publish step 自体が skip され「PR 上に痕跡ゼロ」になる。
job の check run なら cancel / timeout が `cancelled` / `timed_out` として PR に残り、
`finish-branch.sh` はこれを failure として数える。**移植元より単純で、かつ fail-closed が強い。**
`production-config-audit.yml` 側の status publish に同じ弱点が残っている点は別途の課題とする。

移植の過程で、`pull_request_target` 特有の踏み抜きを 3 つ塞いだ。いずれも
「レビューせずに green」に化けるクラスで、`pull_request` のままなら現れなかったもの。

- **concurrency group** — `github.ref` はどの PR でも base branch（`refs/heads/main`）になる。
  ref だけで group を作ると PR をまたいで cancel し合い、あとから走った PR だけがレビューされる。
  group に PR 番号を入れた
- **`AI_REVIEW_HEAD_SHA` の fallback** — `github.sha` は base 先端を指すため、fallback が効くと
  `base...base` の空 diff を「危険クラス 0 件」と読んで緑になる。fallback を外し、
  head SHA が未解決・未到達なら `git cat-file -e` で fail-closed にする step を足した
- **timeout の不等式** — `TOTAL_DEADLINE_MS`(8 分) は attempt の入口でしか評価されず、
  per-attempt には固定の `REQUEST_TIMEOUT_MS`(5 分) を渡していた。締め切り直前に始まった
  attempt がそのまま 5 分走れるため、合計は 8 分ではなく最大 13 分まで伸びる。
  「job の上限より内側で自分から諦める」という script のコメントが定数として成立していなかった。
  per-attempt の signal と backoff を**残り予算で clamp** し、合計が `TOTAL_DEADLINE_MS` で
  止まるようにした。step timeout は 9 分（script の締め切りより外、job の 10 分より内）とし、
  `TOTAL_DEADLINE_MS < step < job` の不等式を contract test で固定した。
  最初は step timeout を 8 分にしたが、それは script が諦める瞬間と同時に step を kill するため
  fail-open が red へ反転する。**定数を揃えずに step timeout だけ足すのは誤り**だった。
  さらに `step < job` だけでは足りない。job timeout は job 全体にかかるので、
  checkout + setup が食った分だけ review step の予算が削られる。実測（2026-07-30、直近 5 run）で
  前段は 31-34 秒、review step は 33-34 秒、job total は 66-72 秒だが、pnpm store cache が
  miss すると install は分単位に伸びる。job を 13 分にして 4 分の余裕を確保し、
  contract test で `job - step >= 4` を固定した。`timeout-minutes` は上限であって予約ではなく、
  課金は実測時間なので広く取っても通常 run のコストは変わらない

同時に、trigger 変更で前提が消えた fail-open を 1 つ塞いだ。`GEMINI_API_KEY` 未設定を
`warn` + `exit 0` で通していたのは「fork PR には secret が渡らない」ことが理由だったが、
`pull_request_target` では secret は常に渡る。残るのは rename / 失効 / 未設定という決定論的な
構成ミスだけで、通すと「毎回 green の gate」が誰にも気づかれずに成立する。fail-closed にした。

判定 cache の出所も絞った。sticky comment は fingerprint と blocked を保存する場所でもあるのに、
`findStickyComment` が author を検証せず marker を含む最初の comment を採用していた。
PR に comment できる者が `blocked=0` の state を先に置けば、model を呼ばずに green を作れる
（fingerprint は repo 内の script で再計算できるので予測可能）。`user.login` を
`github-actions[bot]` に固定した。最初は `user.type === 'Bot'` で絞ったが、それでは
Codex / Copilot / Vercel / Supabase など**任意の bot** が通り、marker を引用した本文を先に
投稿されると `find`（最古の一致を返す）がそれを sticky と誤認して上書き先にしてしまう。

## 逃げ道と、その効き方

`ai-review:override`（所見の誤検出）と `ai-review:contract-reviewed`（監査契約の変更を承認）の
2 ラベルを用意した。承認の対象が別なので分けている。

同じ根（同一 head SHA に 2 本目の run が積まれると古い結果が数えられ続ける）を
**draft PR でも踏む**。`opened`(draft) と `ready_for_review` の両方を素通しにすると、
「draft で open → ready にする」で 2 本目が走り、`cancel-in-progress` により
1 本目が `cancelled` になる。`finish-branch.sh` は `cancelled` も
failure として数えるため、あとから成功した run があっても次の push までマージできない。
job 側で `draft == false` を条件にし、draft 中は skip して ready の時に 1 回だけ走らせた。
draft の反復 push に Gemini の課金を使わない副次効果もある。

**どちらもラベル付与では再発火させない。** 一度 `labeled` を trigger に入れたが、同じ head SHA に
2 本目の run が積まれると `statusCheckRollup` が同名 check を畳まないため、`finish-branch.sh` が
古い run の failure を数え続けてラベルを付けても赤が消えない（2026-07-30 実測: PR #1765 は
check-runs 18 件中 8 名前が重複、rollup 21 件に対し `gh pr checks` は 13 行）。
`gh pr checks` は畳むが `statusCheckRollup` は畳まない、という API の差が原因。
**`finish-branch.sh` が最新 run へ畳んでいない**のが根で、そちらは本 PR の scope 外とした。
現状はラベルを付けた後の push で効く（新しい SHA なら rollup が綺麗になる）。

## 残余リスク

- **contract 検出の範囲は「この job が実行するもの」に限った。** `scripts/ai-review/` /
  `.github/actions/` / `ai-review.yml` / `pnpm-workspace.yaml`（`allowBuilds` allowlist）まで。
  `pnpm-lock.yaml` と `package.json` は依存更新で頻繁に動き、危険クラスと同時に触る正当な PR が
  多いため入れていない。lockfile 経由で install 時に走るコードを差し替える経路は残る
- **`ai-review:contract-reviewed` は PR 単位で効き、diff に束縛されない。** 一度付けると、
  その後の push で追加された契約変更まで自動承認される（`ai-review:override` 側は fingerprint が
  変われば再評価される）
- **`ConfigurationError` クラスには逃げ道が無い。** key 未設定 / 401 / 403 / 404 は
  `AI_REVIEW_ENFORCE=false` でも override ラベルでも解除できない。構成ミスは人間が直すまで
  回復しないため意図的にそうしている。復旧 PR は `scripts/ai-review/` だけを触れば
  paths filter で発火しないので詰まらない
- **run がそもそも起動しない経路は検出できない。** paths 不一致 / workflow 無効化 / Actions 障害では
  check が 0 件になり、`finish-branch.sh` の「成功 1 件以上」は他 workflow の success で満たされる。
  paths filter と `DANGEROUS_PATH_PATTERNS` の一致は contract test で固定しているが、
  それ以外は構造的に見えない

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
