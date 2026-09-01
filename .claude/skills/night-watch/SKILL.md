---
name: night-watch
description: 夜勤 checklist の追加・変更を検討する時、または夜勤 Actions cron の障害時に手動代行する時に発動。read-only の機械判定チェックリストを実行し、赤なら 1 異常 = 1 issue で起票する（緑の夜は無音）。夜間の自動実行そのものは GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job、#2483 で night-watch.yml から統合）が `scripts/ci/night-watch/run-all.mjs` を直接実行して行い、この skill の invocation 経路ではない。
---

# night-watch（計測夜勤）

夜間に read-only の品質観測を行う GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job（#2483 で night-watch.yml から統合）、毎日 **04:00 JST**）。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205) の 2026-08-19 決定コメント。v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)。v2（盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定を追加）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)。v3（Claude Routine から GitHub Actions cron への移植、model を実行系から排除）は [#2367](https://github.com/Dayopt/dayopt/issues/2367)。**v4（「毎朝の読み物」層をすべて廃止し、観測 → 赤なら起票だけに絞った）は [#2525](https://github.com/Dayopt/dayopt/issues/2525)。**

**v3 で実行主体が変わった理由**: v2 までは Claude Code Cloud の scheduled trigger（LLM agent、fresh session）が実行していたが、Anthropic cloud sandbox のプロキシが repo スコープの GitHub REST API を 403 で遮断する構造的障害（[#2216](https://github.com/Dayopt/dayopt/issues/2216) の 2026-08-24 切り分け）を抱え、登録以来一度も正常完走しなかった。夜勤は設計上「判定のみ・裁量なし」で model の裁量を使っていないため、判定ロジックを `scripts/ci/night-watch/run-all.mjs` へ code 化し、GitHub Actions の scheduled workflow から model 不在で実行する形へ移植した（2026-08-25、User 裁可）。

**04:00 JST に置く理由**: `heavy-e2e`/`heavy-web`（nightly 03:00 JST）・`integration`（nightly 03:30 JST）の重量 CI が、夜勤の観測時刻より前に完了するよう配置してある（#2483 でこれらは nightly.yml へ統合済み、schedule コメントは同ファイル冒頭を参照）。**v4（#2525）より前は「朝の蒸留層 05:00 JST から逆算」した時刻でもあったが、その蒸留層は廃止した**ので、後段の締め切りはもう無い。曜日による分岐も無い（旧 v3 は盤面起票だけ平日限定だった）——**土日も平日と同じく観測して、赤なら起票する**。

**夜は書かない。測る・見る・整える。** 夜間の比較優位は「壁時計の時間だけが必要で判断が要らない仕事」= 証拠集めと観測。判定は exit code / 閾値 / baseline 比較のみで、裁量的な探索・修正・KPI 集計は行わない。

**問題があれば issue、無ければ無音**（v4、#2525。User 決定）。毎朝の読み物（当日盤面 issue・常設運行記録への毎晩 1 コメント・DoD 監査候補・朝編成ブリーフ・その先の 05:00 JST 蒸留層）は、読まれる価値より「毎日必ず何かが増える」コストが勝ったため全廃した。夜勤が残す痕跡は **alert issue と GitHub Actions の job log** だけ。緑の夜は何も増えない。

`skill-design` skill の類型上は **明示発動型**。gardening skill と同じ構造で、自動実行（GitHub Actions の scheduled workflow）は Skill tool の invocation 経路の外にある。この skill が実際に invoke されるのは、故障時の手動代行や checklist 変更検討など、人間 or 指揮台の明示判断が要る場面だけ。

## When to Use

**明示発動型** — この skill はユーザー/指揮台の explicit な意図のみを契機に発動する（GitHub Actions の scheduled workflow による自動実行はこの skill の invocation 経路ではない）。

- night-watch job が赤い、または発火した形跡が無く、Actions cron の故障を疑って手動代行する時（`gh run list --workflow=nightly.yml --limit 10` で 04:00 JST 前後の run を確認 → `gh run view <run-id>` で night-watch job の成否を見る。#2483 で nightly.yml へ統合されたため workflow 名だけでは cron を一意に絞れない）
- checklist v1 の項目追加・変更・baseline 更新方針を検討する時
- `scripts/ci/night-watch/run-all.mjs` の判定ロジック（Step 2 の red/green/pending 判定境界）を変更する時

## When NOT to Use

この skill は **explicit な意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 月次の価値判断・ルールの足し引き → `gardening` skill
- 並行作業の定期棚卸し（stale PR・worktree 残骸） → `dispatch` skill 操作 C
- 個別の障害記録 → GitHub issue 起票（2026-08-28、#2475 で `note` skill / domain log/ を廃止）

## 自動パート（GitHub Actions が実施）

**判定ロジックの正本は `scripts/ci/night-watch/run-all.mjs` とその colocated test（`run-all.test.ts`）。** 以下は「何を観測するか」の概要のみで、判定の詳細（red/green/pending の閾値、fail-closed の扱い等）はコードと test を読む。prose とコードの二重管理を避けるため、ここに判定ロジックを複製しない。

GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job）が checkout → 依存インストール（`.github/actions/setup` + pinned/checksum 検証済み Sentry CLI）→ `node scripts/ci/night-watch/run-all.mjs` を毎晩実行する。`run-all.mjs` が import する wrapper は `alert-issue.mjs` と `lib.mjs` の 2 本だけ（v4、#2525 で `board-issue.mjs` / `dod-candidate.mjs` / `run-log.mjs` / `morning-brief.mjs` を削除した）。

### Step 0: 廃止（v3、#2367）

GitHub Actions の `permissions:` ブロックはジョブ開始前に server 側で `GITHUB_TOKEN` の権限を強制するため、同じ非敵対的な script 自身によるランタイム自己検証（旧 v2 の Step 0、層1 token scope の実測検証）より本質的に強い。自動パートからは完全に廃止した。手動代行時の前提条件としての `echo $DAYOPT_NIGHT_WATCH` 確認は §手動代行 に残す（層3 hook の armed 確認という別目的のため）。

### Step 1（観測）

[checklist.md](checklist.md) の 4 項目（`docs-check` / `docs-coverage` / `deadcode` / `dependabot-alerts`）+ `heavy-red` / `integration-red`（CI 赤確認）+ `sentry-new`（直近24h新規 unresolved issue）+ `storage-rls-audit-token-expiry`（#2467、`SUPABASE_STORAGE_RLS_AUDIT_TOKEN` の失効監視）の 8 check-id を観測する。この 8 件が `CHECK_IDS`（`run-all.mjs`）の正本で、**`alert-issue.mjs` の `CHECK_DEFINITIONS`（起票できる id の集合）とは意図的に別物**にしてある（観測ループを経由せず別 job から起票される id が入るため）。

`storage-rls-audit-token-expiry` は他の 7 件と違い gh/sentry を一切呼ばない純粋な日付計算（`checkSecretExpiry`、`run-all.mjs`）。`CHECK_DEFINITIONS['storage-rls-audit-token-expiry'].expiresAt`（token の既知の失効日）を固定値として持ち、`warningDays`（14）以内に迫ると red。ネットワーク越しの取得が無いため fetch-failed 経路（run 内 retry）の対象にならない。token を再発行したら `expiresAt` を更新すること（新しい儀式は作らない——夜勤の既存ループへ 1 本足すだけ、という #2467 の軽量案）。

- **fail-closed 原則**: 観測コマンドが失敗（spawn 失敗・パース不能）した check-id は緑と判定せず `failed` へ記録する
- **一過性の失敗は run 内 retry で吸収する**（v4、#2525）。`execObservationCommand` が最大 2 回まで再試行する。**retry するのは `classifyGhError` が `rate-limited` / `network-error` と分類した失敗だけ**（`isRetriableObservationFailure`）。`network-error` には GitHub / Sentry 側の 5xx（502 / 503 / 504 / 500）も含む — Codex 指摘で、5xx がどの分類語にも該当せず `unknown` へ落ちて 1 回で確定していたことが実測で判明した。timeout kill は除外する — 1 本 240s × 3 回で job 予算（15 分）を溶かし、残りの check の観測と起票ごと runner に kill される。本物の赤（分類できない非 0 exit）・auth-error・ENOENT も除外する（retry しても結果が変わらない）。**判定を「spawn 失敗か否か」で切らないこと** — gh の rate limit も 5xx も DNS 失敗も `status: 1` の非 0 exit で返るため、そこで切ると吸収したい対象がまるごと外れる（2026-09-01 実測、内製クロスレビュー指摘）
  - **`checkExitCode`（docs-check/deadcode）の red/fetch-failed 分岐も同じ分類で揃える**（#2535 item 4）。retry を尽くした後の最終エラーが `isRetriableObservationFailure` 判定で一過性（rate-limited/network-error）と分かる場合は、プロセスが非 0 exit していても（`isSpawnFailure` は false）`fetch-failed` へ倒す。「retry しても駄目だった一過性分類は観測失敗であって赤ではない」という前提を、赤判定を持つ経路すべてで統一する
- **赤判定は直近 run（fetch した3件のうち先頭）の terminal 結果を基準にする**（過去 run に non-success が混じっていても直近が success なら緑。旧 heavy-post-merge.yml / integration.yml は nightly と push:main が同一 concurrency group だったため過去 run が `cancelled` になるのが日常的で、それを含めて判定すると誤起票が常態化した。#2483 で nightly.yml へ統合後は push:main トリガー自体が無くなりこの経路は解消したが、再 dispatch 等で同型が再発しうるため backstop として維持している）
- **pending の stale 判定**（v4、#2525）: `heavy-red` / `integration-red` の「直近 run 未完了」は `pending` として区別し、単発（前夜は成功している cron 遅延）は無音のまま判定を保留する。ただし取得した run 群に **48h 以内の完了した success が 1 件も無ければ red** へ倒す。旧 v3 はこの連晩判定を `checkRecentPending`（常設運行記録 issue のコメント列を数える）に持たせていたが、そのコメント自体を廃止したため run 履歴だけから導出する形へ置き換えた。これが無いと「queued のまま何晩も進まない」が永遠に無音になる
  - **pending 判定は allowlist（`status !== 'completed'`）**（#2534）。旧実装は `in_progress` / `queued` の denylist で、`waiting`（environment protection rule 承認待ち）等の未知の非 completed 値が pending からも「直近 run の terminal 結果」判定からも漏れ、判定の根拠が採用 run を離れて古い run へ移っていた。`isLatestWorkflowRunPending`（`lib.mjs`）が正本
  - success の判定には `status === 'completed'` も要求する。Codex 指摘で、`checkWorkflowJobRun` の畳み込みが `[in_progress, success]` を偽の success にしていた（未完了 job の `conclusion` も `null` なので、`worst === null` を初回の番兵に使う reduce が 2 件目で無検査に上書きしていた）ことが実測で判明した。畳み込み側も直したが、無音へ倒す判断はこちらでも確かめる
  - **履歴の一部を読めなかった夜は stale を確定させない**（`fetch-failed` へ縮退）。stale は「窓内に success が無い」ことを根拠にするので、前夜の success run だけ jobs API が落ちると誤 red を起票する（Codex 指摘、実測確定）
- 判定関数は `judgeCountBaseline` / `judgeWorkflowRun` / `classifyGhError`（`run-all.mjs`）

### Step 2（起票/追記）

赤の check-id ごとに `runAlertSync`（`alert-issue.mjs`）を呼ぶ。dedup・run-scoped 起票上限（1 run 3 件・check-id 単位 1 回）は `alert-issue.mjs` / `lib.mjs` が担う。

**観測コマンド自体の取得失敗（fetch-failed）も issue にする**（2026-08-27、[#2422](https://github.com/Dayopt/dayopt/issues/2422)。v4 で条件を変更）: run 内 retry でも回復しなかった check-id について `runFetchFailureAlertSync`（`alert-issue.mjs`）を呼ぶ。issue の title prefix は `nightwatch-fetch-failed(<checkId>)`（red-alert 用の `nightwatch(<checkId>)` とは意図的に別 prefix — dedup 検索が別事象の issue を誤って再利用しないため）。旧 v3 の「3 晩連続で起票」は、連晩を数える手段（常設運行記録 issue のコメント列）ごと廃止したため成立しない。

**fetch-failed の起票は、全 check-id の赤判定が確定した後にまとめて処理する**（`deferredFetchFailed`、#2422 の P2 是正・PR #2445）。起票予算は run 全体で共有されているため、逐次処理すると慢性的な観測失敗が先に使い切って本物の CI 赤が起票されなくなる。v4 で fetch-failed が当夜起票になったぶん、この順序の重要性はむしろ上がっている。

**異常を検出したのに issue を残せなかったら job を非 0 exit にする**（夜勤の主目的が壊れたのに job が緑、という最悪の組み合わせを防ぐ）。これは例外が飛んだ場合だけでなく、**dedup 検索の失敗で起票を見送った場合も含む** — `runAlertSync` は `gh issue list --search` が落ちると throw せず `{ action: 'skipped' }` を返す（fail closed で誤起票を避ける設計）ため、そこを拾わないと gh 障害・token scope 退行の夜に「本物の赤あり / issue ゼロ / job 緑」が成立する（内製クロスレビュー risk-reviewer 指摘 high）。`run-cap-reached`（`MAX_NEW_ISSUES_PER_RUN` による意図的な減衰）は `isAlertDeliveryFailure`（＝ alert 投稿失敗としての扱い）の対象外——これは変えていない。

**ただし `run-cap-reached` が 1 件でもあれば、別経路で job を非 0 exit にする**（#2535 item 3、推奨案 a）。4 本以上が同時赤化した夜、4 本目以降は意図的に起票を見送るが、その事実が job log のサマリ 1 行（`予算超過 N`）にしか残らず job 自体は緑のままだと朝に気づけない。起票そのものはしない（`MAX_NEW_ISSUES_PER_RUN` の濫造防止の意図はそのまま維持する）が、job を赤くして気づけるようにする。

### Step 3（run サマリを job log へ）

`buildRunSummaryLine`（`run-all.mjs`）が「観測 N/7 | 起票 N | 保留 N | 起票失敗 N | 予算超過 N | 取得失敗 N」の 1 行を `console.log` へ出す。**「起票失敗」（gh 障害）と「予算超過」（意図的な減衰）と「取得失敗」（観測できなかった）を畳まない** — この 1 行が唯一の人間可読な記録なので、原因の違いが読めないと故障の切り分けに使えない。pending だけの夜は verdict を `判定保留あり` にする（`要確認` に倒すと、heavy-e2e が 04:00 時点で走行中という日常で毎晩赤く見えて識別力が落ちる）。常設運行記録 issue への毎晩 1 コメントを廃止したため、run の結論を人が後から読める場所はここだけ。**exitCode を立てる前に出す** — 先に倒して出力を飛ばすと「赤を検出したのに起票できなかった」という最も知りたい事実がどこにも残らない。

## トークン（secrets）

GitHub Actions の `secrets.NIGHT_WATCH_DEPENDABOT_TOKEN`（Dependabot alerts: read の fine-grained PAT）と `secrets.SENTRY_AUTH_TOKEN`（1Password `sentry-cli-readonly` item と同じ read-only scope）を使う。値の登録・更新は指揮台/User の操作枠で行い、`run-all.mjs` はこの 2 つを起動直後に `process.env` から捕捉して削除し、`pnpm docs:check` 等のサードパーティ依存コードを大量実行するコマンドから見えないようにする（`run-all.mjs` 冒頭コメント参照）。**`GH_TOKEN`（`github.token`）もこの分離の対象**: gh を必要としないコマンド（`docs:check` / `docs:coverage` / `quality:deadcode:ci` / `sentry`）へは `envWithout('GH_TOKEN', 'GITHUB_TOKEN')` で GH_TOKEN を持たない env を渡す。workflow の `permissions:` ブロックによる最小権限化に加え、必要な呼び出し（`gh api` / `gh run list` / `gh issue ...`）にだけトークンを見せる二重の防御にする（push 前反証レビュー risk-reviewer 指摘、medium）。

## checklist・baseline の変更

checklist（[checklist.md](checklist.md)）と baseline（[baseline.json](baseline.json)）の変更は通常の PR レビューを通す。night-watch 自身（Actions workflow・手動代行のどちらも）はこの 2 ファイルを読むだけで編集しない（review-gated ratchet）。

## 手動代行

`gh run list --workflow=nightly.yml --limit 10` + `gh run view <run-id>` で night-watch job の故障が確認できたら、指揮台がローカルで checklist を代行実行してよい。前提条件:

1. `echo $DAYOPT_NIGHT_WATCH` が `1` であること（層3 hook allowlist、下記参照、が armed になっているかの確認）
2. `gh api repos/Dayopt/dayopt --jq .permissions` を実行し、`push` / `admin` が true でないこと（手動代行に使う token の scope 確認）

いずれかが想定外なら、checklist を一切実行せずその場で止めて指揮台へ報告する（v4、#2525 で `run-log.mjs env-failure` による自動報告経路は wrapper ごと廃止した。報告先の常設運行記録 issue が無くなったため）。

前提を満たしていれば、§自動パート と同じ Step 1〜2 を手動で辿る（secrets は `.op-env.human` 経由の 1Password 参照に読み替える）。**`node scripts/ci/night-watch/run-all.mjs` の直接実行は不可**（層3 hook allowlist は個別 wrapper を 1 本ずつ完全一致で許可する設計のため、`run-all.mjs` の単体呼び出しは含まれない。Codex レビュー指摘・指揮台採用、PR #2380）。checklist コマンド（`pnpm docs:check` 等）と `check-workflow-job.mjs heavy-red|integration-red` で観測し、赤があれば `alert-issue.mjs report <check-id> ...` で起票する。**v4 以降、night-watch モードで許可される書き込み経路は `alert-issue.mjs` の 2 サブコマンドだけ**（夜勤が触ってよい issue は「自分が起票した alert issue」に限られる）: 赤は `report <check-id> ...`、観測コマンド自体の取得失敗は `report-fetch-failed <check-id>`。後者は Codex 指摘で追加した — 自動パートは `run-all.mjs` から直接呼ぶが、手動代行はこの allowlist を通る wrapper 経由でしか書けないため、これが無いと代行時に観測失敗を issue へ残せなかった。**どちらも dedup 検索が失敗して起票を見送った場合は非 0 exit で終わる**（起票できていないのに成功に見えるのを防ぐ）。

**層3（repo hook）**: `scripts/hooks/pre-tool-guard-impl.sh` が `DAYOPT_NIGHT_WATCH=1` を検出した時のみ有効になる allowlist（denylist ではない）。手動代行専用の防御として維持する（Actions cron はこの hook の対象外 — Bash tool 経由の実行ではないため）。allowlist の対象コマンド・設計原則は変更していない（旧 §権限の構造的強制 層3 の内容のまま。詳細は hook 本体のコメントを参照）。

**night-watch job だけを Actions 上で手動再実行したい場合**（ローカル代行ではなく `gh workflow run` で再現したい時）は `gh workflow run nightly.yml -f jobs=night-watch` を使う。**`-f jobs=all` は選ばない** — `all` は post-merge の一括検証専用で、storage-backup-export（実データ転送）・status-label-sweep も同時に起動する。night-watch 単独の再実行のつもりで `all` を選ぶと、意図せず実 backup 転送を誘発する（内製クロスレビュー risk-reviewer 指摘、P2、PR #2484）。

## 故障モード

- **夜勤が動いた形跡が無い** — v4（#2525）以降、緑の夜は issue が 1 件も増えないのが正常系なので、「無音」だけでは故障を判定できない。判定材料は GitHub Actions の run そのもの: `gh run list --workflow=nightly.yml --limit 10` で直近 run 一覧を取得し、04:00 JST 前後の run を `gh run view <run-id>` で開いて night-watch job の成否を確認する（失敗していればログは `gh run view <run-id> --log-failed`）。run 自体が発火していなければ nightly.yml の schedule 設定を確認する。**job が緑なら、log の `night-watch: ...` サマリ 1 行が run の結論**（この行が無いまま緑なら、途中で kill された可能性がある）。故障していれば §手動代行 で代行する
  - **job 自身が失敗/timeout（`timeout-minutes: 15`）で強制終了した夜の backstop**（#2535 item 1）: `nightly.yml` の night-watch job 末尾に `if: failure() || cancelled()` の step があり、`alert-issue.mjs report-fetch-failed night-watch-self --run-url <run URL>` で固定タイトルの alert issue（`nightwatch-fetch-failed(night-watch-self)`）を起票する。GitHub Actions は job 自身の timeout を cancellation として扱うため `cancelled()` も見る（`failure()` だけでは timeout を拾えない）。ただし runner が cancellation 後に猶予するごく短い grace period 内でしか動かないため、**確実な backstop ではない**（観測フェーズ全体の deadline 設計は #2535 item 2 として未着手のまま残す）。この issue が open なら「job が死んだ夜」の直接証拠になる
- **Sentry org slug（`dayopt`）が変わる** — `SENTRY_EVIDENCE_RE`（`scripts/ci/night-watch/alert-issue.mjs`）の subdomain は固定文字列なので、org slug が変われば `sentry-new` の evidence が全件拒否され、件数のみの起票すら出せなくなる。org slug 変更時は `SENTRY_EVIDENCE_RE` と `CHECK_DEFINITIONS['sentry-new'].command` の org 名を同時に更新する
- **Sentry CLI の version/checksum が古くなる** — `.github/workflows/nightly.yml`（night-watch job）の `NIGHT_WATCH_CLI_VERSION` / `NIGHT_WATCH_CLI_CHECKSUM_SHA256` は pin されているため自動更新されない。更新する時は `gh api repos/getsentry/cli/releases/tags/<VERSION> --jq '.assets[] | select(.name=="sentry-linux-x64") | .digest' | sed 's/^sha256://'` で新 version の digest を取り直す（`releases/latest` ではなく pin 対象 version を明示する。digest の `sha256:` prefix は `sed` で落とす）。**env 変数名に「SENTRY」を含めない**（gitleaks の `sentry-access-token` ルールが変数名+hex文字列で誤検知するため。`nightly.yml` の night-watch job、該当 step コメント参照）

## 守ること

- checklist の変更は通常の PR レビューを通す（Actions workflow・手動代行のどちらも checklist.md / baseline.json を編集しない）
- 新ラベルを作らない。既存体系（`docs/operations/github-labels.md`）のみ使う
- **書き込み先は自分が起票した alert issue（`nightwatch(...)` / `nightwatch-fetch-failed(...)`）に限る**（v4、#2525）。他の issue のラベル変更・close・コメント・PR 操作は一切行わない。層3 hook の allowlist もこれに合わせて `alert-issue.mjs` の `report` / `report-fetch-failed` の 2 形だけを許可する
- Sentry issue の個別 triage（`resolve` 等の write 操作、担当割り当て）は行わない。列挙して起票するだけ
- **Sentry issue の raw title / culprit / message を issue 本文へ転記しない**（public repo、2026-09 private 化まで。載せてよいのは件数・short ID・Sentry issue URL のみ）。`alert-issue.mjs` の `SENTRY_EVIDENCE_RE` がこれを機械強制する
- 観測コマンドが取得失敗（spawn 失敗・パース不能）の場合、緑と判定しない（fail-closed）。run 内 retry でも回復しなければ `nightwatch-fetch-failed(<check-id>)` として起票する
