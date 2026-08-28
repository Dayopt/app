---
name: night-watch
description: 夜勤 checklist の追加・変更を検討する時、または夜勤 Actions cron の障害時に手動代行する時に発動。read-only の機械判定チェックリストを実行し、赤なら 1 異常 = 1 issue で起票、常設運行記録 issue へ毎晩 1 コメントする。夜間の自動実行そのものは GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job、#2483 で night-watch.yml から統合）が `scripts/ci/night-watch/run-all.mjs` を直接実行して行い、この skill の invocation 経路ではない。
---

# night-watch（計測夜勤）

夜間に read-only の品質観測を行う GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job（#2483 で night-watch.yml から統合）、毎日 **04:00 JST**）。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205) の 2026-08-19 決定コメント。v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)。v2（盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定を追加）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)。**v3（Claude Routine から GitHub Actions cron への移植、model を実行系から排除）は [#2367](https://github.com/Dayopt/dayopt/issues/2367)。**

**v3 で実行主体が変わった理由**: v2 までは Claude Code Cloud の scheduled trigger（LLM agent、fresh session）が実行していたが、Anthropic cloud sandbox のプロキシが repo スコープの GitHub REST API を 403 で遮断する構造的障害（[#2216](https://github.com/Dayopt/dayopt/issues/2216) の 2026-08-24 切り分け）を抱え、登録以来一度も正常完走しなかった。夜勤は設計上「判定のみ・裁量なし」で model の裁量を使っていないため、判定ロジックを `scripts/ci/night-watch/run-all.mjs` へ code 化し、GitHub Actions の scheduled workflow から model 不在で実行する形へ移植した（2026-08-25、User 裁可）。

**04:00 JST に固定する理由**: 朝の蒸留層（Haiku、05:00 JST 固定）から逆算した配置（2026-08-25、#2367 の scope 追加、User 決定）。旧 07:00 JST → 05:00 JST（2026-08-24、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント）からさらに前倒しした。`heavy-e2e`/`heavy-web`（nightly 03:00 JST）・`integration`（nightly 03:30 JST）の重量 CI は、夜勤が結果を読める時刻（04:00 JST）より前に完了するよう配置してある（CI 完了後 60/30 分の相対配置は前倒し前と同じ。#2483 でこれらは nightly.yml へ統合済み、schedule コメントは同ファイル冒頭を参照）。**盤面 issue の起票（Step 1）だけは平日のみ**、健康診断・異常起票・運行記録（Step 2・3・5）は土日も毎日行う（§自動パート 参照）。

**夜は書かない。測る・見る・整える。** 夜間の比較優位は「壁時計の時間だけが必要で判断が要らない仕事」= 証拠集めと観測。判定は exit code / 閾値 / baseline 比較のみで、裁量的な探索・修正・KPI 集計は行わない。出力先は issue に一本化する（`.claude/rules/orchestration.md` §盤面の正本と同じ理由）。

`.claude/rules/skill-design.md` の類型上は **明示発動型**。gardening skill と同じ構造で、自動実行（GitHub Actions の scheduled workflow）は Skill tool の invocation 経路の外にある。この skill が実際に invoke されるのは、故障時の手動代行や checklist 変更検討など、人間 or 指揮台の明示判断が要る場面だけ。

## When to Use

**明示発動型** — この skill はユーザー/指揮台の explicit な意図のみを契機に発動する（GitHub Actions の scheduled workflow による自動実行はこの skill の invocation 経路ではない）。

- 常設運行記録 issue に前夜のコメントが無く、Actions cron の故障を疑って手動代行する時（`gh run list --workflow=nightly.yml --limit 10` で 04:00 JST 前後の run を確認 → `gh run view <run-id>` で night-watch job の成否を見る。#2483 で nightly.yml へ統合されたため、workflow 名だけでは night-watch の cron を一意に絞れない）
- checklist v1 の項目追加・変更・baseline 更新方針を検討する時
- `scripts/ci/night-watch/run-all.mjs` の判定ロジック（Step 2 の red/green/pending 判定境界）を変更する時

## When NOT to Use

この skill は **explicit な意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 月次の価値判断・ルールの足し引き → `gardening` skill
- 並行作業の定期棚卸し（stale PR・worktree 残骸） → `dispatch` skill 操作 C
- 個別の障害記録 → GitHub issue 起票（2026-08-28、#2475 で `note` skill / domain log/ を廃止）
- 夜勤の出力（盤面ブリーフ・運行記録）を読んで指揮台向けに整理する朝の蒸留層の障害・仕様変更 → `morning-digest` skill

## 自動パート（GitHub Actions が実施）

**判定ロジックの正本は `scripts/ci/night-watch/run-all.mjs` とその colocated test（`run-all.test.ts`）。** 以下は「何を観測するか」の概要のみで、判定の詳細（red/green/pending の閾値、fail-closed の扱い等）はコードと test を読む。prose とコードの二重管理を避けるため、ここに判定ロジックを複製しない（既存 wrapper 4 ファイルは今もこの節を `SKILL.md §自動パート Step N` として参照しているため、v3 でも見出し文字列は変えていない）。

GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job）が checkout → 依存インストール（`.github/actions/setup` + pinned/checksum 検証済み Sentry CLI）→ `node scripts/ci/night-watch/run-all.mjs` を毎晩実行する。`run-all.mjs` は既存 wrapper（`board-issue.mjs` / `alert-issue.mjs` / `dod-candidate.mjs` / `run-log.mjs` / `lib.mjs`）を import して呼ぶ。既存 wrapper への変更点は下記参照（`checkRecentPending` の点修正、および #2422 で `checkRecentFetchFailed` / `runFetchFailureAlertSync` を追加）。

### Step 0: 廃止（v3、#2367）

GitHub Actions の `permissions:` ブロックはジョブ開始前に server 側で `GITHUB_TOKEN` の権限を強制するため、同じ非敵対的な script 自身によるランタイム自己検証（旧 v2 の Step 0、層1 token scope の実測検証）より本質的に強い。自動パートからは完全に廃止した。手動代行時の前提条件としての `echo $DAYOPT_NIGHT_WATCH` 確認は §手動代行 に残す（層3 hook の armed 確認という別目的のため）。

### Step 1〜6

1. **Step 1（盤面起票）** — `runBoardSync`（`board-issue.mjs`）を呼ぶ。**平日のみ実行**（土日は `isJstWeekend` 判定で gh を一切呼ばず skip）。テンプレ本体の正本は `dispatch` skill 操作C §日次盤面issueの起票（複製しない）
2. **Step 2（観測）** — [checklist.md](checklist.md) の 4 項目（`docs-check` / `docs-coverage` / `deadcode` / `dependabot-alerts`）+ `heavy-red` / `integration-red`（CI 赤確認）+ `sentry-new`（直近24h新規 unresolved issue）の 7 check-id を観測する。**fail-closed 原則**: 観測コマンドが失敗（spawn 失敗・パース不能）した check-id は緑と判定せず `failed` へ記録する。`heavy-red` / `integration-red` の「直近 run 未完了」は `pending` として区別し、`checkRecentPending`（`run-log.mjs`）による 2 晩連続判定で 3 晩目に赤へ escalate する（#2350 の設計を踏襲）。**赤判定は直近 run（fetch した3件のうち先頭）の terminal 結果を基準にする**（過去 run に non-success が混じっていても直近が success なら緑。旧 heavy-post-merge.yml/integration.yml は nightly と push:main が同一 concurrency group だったため（#2483 で nightly.yml へ統合後は push:main トリガー自体が無くなり、この経路は解消済み）、過去 run が `cancelled` になるのは日常的に発生し、それを含めて判定すると誤起票が常態化するため。直近24hにsuccessが無ければ赤、という第2条件が見逃し防止の backstop）。判定関数は `judgeCountBaseline` / `judgeWorkflowRun` / `classifyGhError`（`run-all.mjs`）。**観測コマンド自体の取得失敗（fetch-failed）も同型で escalate する**（2026-08-27、[#2422](https://github.com/Dayopt/dayopt/issues/2422)）: `checkRecentFetchFailed`（`run-log.mjs`）が直近 2 晩の運行記録レポートで同一 check-id が連続して取得失敗だったかを見て、3 晩連続で `runFetchFailureAlertSync`（`alert-issue.mjs`）を呼ぶ。escalation issue の title prefix は `nightwatch-fetch-failed(<checkId>)`（red-alert 用の `nightwatch(<checkId>)` とは意図的に別 prefix — dedup 検索が別事象の issue を誤って再利用しないため）。取得失敗の原因診断（token scope 不足・ネットワーク断・応答パース不能等）は `execObservationCommand`（`run-all.mjs`）が失敗のたびに GitHub Actions job log（`::warning::`）へ出す
3. **Step 3（起票/追記）** — 赤の check-id ごとに `runAlertSync`（`alert-issue.mjs`）を呼ぶ。dedup・run-scoped 起票上限（1 run 3 件・check-id 単位 1 回）は `alert-issue.mjs` / `lib.mjs` が無変更のまま担う
4. **Step 4（DoD 監査候補選定）** — `runDodCandidateSelect`（`dod-candidate.mjs`）を呼ぶ。**土日は skip、月曜は金〜日 3 日分へ窓を拡張**（既存挙動）。この Step の想定外失敗（`run-log.mjs` の `dod` schema に `fail` 状態が無いため）は `dod: {status:'none'}` として報告した上で job を非 0 exit にする（`run-all.mjs` の `runStep4Dod` 参照。job の赤で検出可能にする設計）
5. **Step 5（運行記録）** — `runOpsLogReport` / `runBoardNote`（`run-log.mjs`）で常設運行記録 issue と当日盤面 issue へ結果を記録する。**この投稿自体が失敗したら job を非 0 exit にする**（新しい故障検出手段が `gh run list --workflow=nightly.yml` + job 単位の成否確認のため、運行記録が 1 行も残らず job が緑、という最悪の組み合わせを防ぐ）
6. **Step 6（朝編成ブリーフ、v3.1、#2370）** — `runMorningBrief`（`morning-brief.mjs`、新設 wrapper）を呼ぶ。朝の編成（`.claude/rules/orchestration.md` §1 日サイクル）で指揮台が毎朝手動で行っていた観測系 gh クエリ（`status:ready` / `status:in-progress` 棚卸し・open PR/CI 状態・milestone 整合）を前倒しし、当日盤面 issue へ機械生成の 1 コメントとして残す。**判断語（推奨・優先等）を含めない** — `status:ready` issue の handoff-quality 機械判定（`dispatch` skill §`status:ready`の定義 と同じ 4 見出し検査）・stale 判定（48h超）・**停滞疑いレーン検出（open Draft PR のうち最終 commit から 4 営業時間超のもの。2026-08-26、[#2415](https://github.com/Dayopt/dayopt/issues/2415)）**・milestone 未付与列挙・dispatch 可能 issue ごとの chip 下書き（固定部分のみ、案件固有の注意と束ねの判断は空欄で指揮台に残す）。停滞疑いの閾値を「営業時間」（JST 平日 09:00-18:00）で数えるのは、このブリーフが 04:00 JST に 1 日 1 回生成されるため。素の経過時間だと前日日中に commit して正常に終えたレーンが毎朝全件並び、節が形骸化する。これは `.claude/rules/lane-protocol.md` §停止条件（レーンの自己申告）に対する機械側の二段目で、**片方がもう片方の省略理由にならない**。当日盤面 issue が無い日（土日・Step 1 起票失敗）は gh を追加で呼ばず skip する。失敗しても非致命（他 Step の結果には影響しない）

**`run-log.mjs` への唯一の変更点（v3、DoD 改訂により許可された点修正）**: `checkRecentPending` の信頼できる書き手判定に、`github-actions[bot]`（Actions の既定 `GITHUB_TOKEN` での投稿者）を login 完全一致で OR 追加した。実測（PR #2358）で `github-actions[bot]` の `authorAssociation` は `NONE`（OWNER/MEMBER/COLLABORATOR いずれにも該当しない）と確認されており、この修正が無いと夜勤自身の運行記録コメントが信頼集合から漏れ、pending escalation（#2350）が Actions 化後は恒久的に発火しなくなる。第三者は `github-actions[bot]` という login を偽装できないため、public repo での偽装耐性は維持される。

## トークン（secrets）

GitHub Actions の `secrets.NIGHT_WATCH_DEPENDABOT_TOKEN`（Dependabot alerts: read の fine-grained PAT）と `secrets.SENTRY_AUTH_TOKEN`（1Password `sentry-cli-readonly` item と同じ read-only scope）を使う。値の登録・更新は指揮台/User の操作枠（`.claude/rules/orchestration.md` §1 日サイクル）で行い、`run-all.mjs` はこの 2 つを起動直後に `process.env` から捕捉して削除し、`pnpm docs:check` 等のサードパーティ依存コードを大量実行するコマンドから見えないようにする（`run-all.mjs` 冒頭コメント参照）。**`GH_TOKEN`（`github.token`）もこの分離の対象**: gh を必要としないコマンド（`docs:check` / `docs:coverage` / `quality:deadcode:ci` / `sentry`）へは `envWithout('GH_TOKEN', 'GITHUB_TOKEN')` で GH_TOKEN を持たない env を渡す。workflow の `permissions:` ブロックによる最小権限化に加え、必要な呼び出し（`gh api` / `gh run list` / `gh issue ...`）にだけトークンを見せる二重の防御にする（push 前反証レビュー risk-reviewer 指摘、medium）。

## checklist・baseline の変更

checklist（[checklist.md](checklist.md)）と baseline（[baseline.json](baseline.json)）の変更は通常の PR レビューを通す。night-watch 自身（Actions workflow・手動代行のどちらも）はこの 2 ファイルを読むだけで編集しない（review-gated ratchet）。

## 手動代行

`gh run list --workflow=nightly.yml --limit 10` + `gh run view <run-id>` で night-watch job の故障が確認できたら、指揮台がローカルで checklist を代行実行してよい。前提条件:

1. `echo $DAYOPT_NIGHT_WATCH` が `1` であること（層3 hook allowlist、下記参照、が armed になっているかの確認）
2. `gh api repos/Dayopt/dayopt --jq .permissions` を実行し、`push` / `admin` が true でないこと（手動代行に使う token の scope 確認）

いずれかが想定外なら、checklist を一切実行せず `node scripts/ci/night-watch/run-log.mjs env-failure no-var`（DAYOPT_NIGHT_WATCH 未検出時）または `env-failure write-token`（token に write 権限あり時）を実行して終了する。以降は §自動パート と同じ Step 1〜5 を手動で辿る（secrets は `.op-env.human` 経由の 1Password 参照に読み替える）。**`node scripts/ci/night-watch/run-all.mjs` の直接実行は不可**（層3 hook allowlist は個別 wrapper を 1 本ずつ完全一致で許可する設計のため、`run-all.mjs` の単体呼び出しは含まれない。Codex レビュー指摘・指揮台採用、PR #2380）。Step 1〜5 はそれぞれの個別 wrapper（`board-issue.mjs sync` / checklist コマンド / `alert-issue.mjs report ...` / `dod-candidate.mjs select` / `run-log.mjs ...`）で辿ること。

**層3（repo hook）**: `.claude/hooks/pre-tool-guard-impl.sh` が `DAYOPT_NIGHT_WATCH=1` を検出した時のみ有効になる allowlist（denylist ではない）。手動代行専用の防御として維持する（Actions cron はこの hook の対象外 — Bash tool 経由の実行ではないため）。allowlist の対象コマンド・設計原則は変更していない（旧 §権限の構造的強制 層3 の内容のまま。詳細は hook 本体のコメントを参照）。

## 故障モード

- **常設運行記録 issue に前夜コメントが無い** — 朝の編成 sweep（`.claude/rules/orchestration.md` §1 日サイクル）で検出する。`gh run list --workflow=nightly.yml --limit 10` で直近 run 一覧を取得し、04:00 JST 前後の run を `gh run view <run-id>` で開いて night-watch job の成否を確認する（失敗していればログは `gh run view <run-id> --log-failed`）。run 自体が発火していなければ nightly.yml の schedule 設定を確認する。run は成功しているのに運行記録コメントが無い場合は §手動代行 で代行する
- **Sentry org slug（`dayopt`）が変わる** — `SENTRY_EVIDENCE_RE`（`scripts/ci/night-watch/alert-issue.mjs`）の subdomain は固定文字列なので、org slug が変われば `sentry-new` の evidence が全件拒否され、件数のみの起票すら出せなくなる。org slug 変更時は `SENTRY_EVIDENCE_RE` と `CHECK_DEFINITIONS['sentry-new'].command` の org 名を同時に更新する
- **Sentry CLI の version/checksum が古くなる** — `.github/workflows/nightly.yml`（night-watch job）の `NIGHT_WATCH_CLI_VERSION` / `NIGHT_WATCH_CLI_CHECKSUM_SHA256` は pin されているため自動更新されない。更新する時は `gh api repos/getsentry/cli/releases/tags/<VERSION> --jq '.assets[] | select(.name=="sentry-linux-x64") | .digest' | sed 's/^sha256://'` で新 version の digest を取り直す（`releases/latest` ではなく pin 対象 version を明示する。digest の `sha256:` prefix は `sed` で落とす）。**env 変数名に「SENTRY」を含めない**（gitleaks の `sentry-access-token` ルールが変数名+hex文字列で誤検知するため。`nightly.yml` の night-watch job、該当 step コメント参照）

## 守ること

- checklist の変更は通常の PR レビューを通す（Actions workflow・手動代行のどちらも checklist.md / baseline.json を編集しない）
- 新ラベルを作らない。既存体系（`docs/operations/github-labels.md`）のみ使う
- **書き込み先は常設運行記録 issue と当日/前日の盤面 issue（`type:board`）に限る**。盤面 issue への書き込みは Step 1（起票・前日分の close）・Step 4（DoD候補コメント）・Step 5（タイムラインコメント）に限定する。それ以外の issue のラベル変更・close・PR操作は一切行わない
- Sentry issue の個別 triage（`resolve` 等の write 操作、担当割り当て）は行わない。列挙して起票するだけ
- **Sentry issue の raw title / culprit / message を issue 本文へ転記しない**（public repo、2026-09 private 化まで。載せてよいのは件数・short ID・Sentry issue URL のみ）。`alert-issue.mjs` の `SENTRY_EVIDENCE_RE` がこれを機械強制する
- Step 2 の観測コマンドが取得失敗（spawn 失敗・パース不能）の場合、緑と判定せず `<check-id>: 取得失敗` を Step 5 へ記録する（fail-closed）
