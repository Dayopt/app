---
name: night-watch
description: 計測夜勤 Routine の障害時に手動代行する時、または夜勤 checklist の追加・変更を検討する時に発動。read-only の機械判定チェックリストを実行し、赤なら 1 異常 = 1 issue で起票、常設運行記録 issue へ毎晩 1 コメントする。夜間の自動実行そのものは Claude Routine の scheduled trigger が本ファイル §自動パートを直接参照して行い、この skill の invocation 経路ではない。
---

# night-watch（計測夜勤）

夜間に read-only の品質観測を行う Routine（Claude Code Cloud の scheduled trigger、毎日 **05:00 JST**、fresh session）。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205) の 2026-08-19 決定コメント。v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)。v2（本ファイル現行版、盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定を追加）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)。

**05:00 JST に固定する理由**: 毎日運行への確定に伴い旧 07:00 JST から前倒しした（2026-08-24 User 決定、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント参照）。`heavy-post-merge`（nightly 04:00 JST）・`integration`（nightly 04:30 JST）の重量 CI は、夜勤が結果を読める時刻（05:00 JST）より前に完了するよう配置してある（`.github/workflows/heavy-post-merge.yml` / `.github/workflows/integration.yml` の schedule コメント参照）。**盤面 issue の起票（Step 1）だけは平日のみ**、健康診断・異常起票・運行記録（Step 0・2・3・5）は土日も毎日行う（§Step 1・§Step 4 参照）。

**夜は書かない。測る・見る・整える。** 夜間の比較優位は「壁時計の時間だけが必要で判断が要らない仕事」= 証拠集めと観測。判定は exit code / 閾値 / baseline 比較のみで、裁量的な探索・修正・KPI 集計は行わない。出力先は issue に一本化する（`.claude/rules/orchestration.md` §盤面の正本と同じ理由）。

`.claude/rules/skill-design.md` の類型上は **明示発動型**。gardening skill と同じ構造で、自動実行（Routine の scheduled trigger）は Skill tool の invocation 経路の外にある — Routine のプロンプトは本ファイル §自動パートを直接参照するだけで、`Skill(night-watch)` を呼び出さない。この skill が実際に invoke されるのは、故障時の手動代行や checklist 変更検討など、人間 or 指揮台の明示判断が要る場面だけ。

## When to Use

**明示発動型** — この skill はユーザー/指揮台の explicit な意図のみを契機に発動する（Routine の scheduled trigger による自動実行はこの skill の invocation 経路ではない）。

- 常設運行記録 issue に 2 晩連続でコメントが無く、Routine の故障を疑って手動代行する時
- checklist v1 の項目追加・変更・baseline 更新方針を検討する時
- 権限の3層防御（層1 token scope・層2 allowed_tools・層3 hook allowlist）の設定を見直す時

## When NOT to Use

この skill は **explicit な意図のみを契機とする**。暗黙的な invocation ケースは該当なし（型の穴埋めとして明記）。参考として近接するが発動しないケース:

- 月次の価値判断・ルールの足し引き → `gardening` skill
- 並行作業の定期棚卸し（stale PR・worktree 残骸） → `dispatch` skill 操作 C
- 個別の障害記録ログ作成 → `note` skill（`docs/operations/log/`）

## 自動パート（Routine が実施）

fresh session で以下を順に実施する。**価値判断・修正・裁量的探索は一切行わない。** アプリコード・docs は変更しない。書けるのは GitHub issue のみ（起票・コメント追記）。

### Step 0: 自己検証（fail-open 対策）

層3（repo hook の allowlist）は `DAYOPT_NIGHT_WATCH` 環境変数が真であることに依存する。この変数が Cloud Environment 側で注入されなければ、hook は無音で無効化され、夜勤は通常レーンと同じ権限で走ってしまう（fail-open）。これを「静かな素通り」ではなく「観測可能な異常」に変えるため、checklist 実行前に必ず次を確認する:

1. `echo $DAYOPT_NIGHT_WATCH` が `1` であること
2. `gh api repos/Dayopt/dayopt --jq .permissions` を実行し、`push` / `admin` が true でないこと（層1 token scope の実測検証）

いずれかが想定外なら、**checklist を一切実行せず**、`node scripts/night-watch/run-log.mjs env-failure no-var`（DAYOPT_NIGHT_WATCH 未検出時）または `node scripts/night-watch/run-log.mjs env-failure write-token`（token に write 権限あり時）を実行して終了する。wrapper が常設運行記録 issue の番号を `docs/operations/night-watch.md` から自分で解決し、固定 2 文言のいずれかをコメントする（自由文は受け付けない）。これは checklist の異常とは別枠で、次回実行時も同じ状態なら毎晩同じ内容で報告し続ける（dedup の対象にしない — 環境故障は毎晩観測されるべき）。

### Step 1: 盤面起票

`node scripts/night-watch/board-issue.mjs sync` を実行する。**テンプレ本体の正本は `dispatch` skill 操作C §日次盤面issueの起票**（複製しない。wrapper 内の `BOARD_BODY_TEMPLATE` はその実行用の写し）。

**平日のみ実行する**（[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント、night-watch の毎日運行化に伴う改訂）。日次盤面 issue という運用単位は平日基準（`.claude/rules/orchestration.md` §日次盤面issue、指揮台の 1 日サイクルと対応）のため、JST 土曜・日曜は gh を一切呼ばずに `{ action: 'skipped', reason: 'weekend' }` を返す（wrapper 内部の `isJstWeekend` 判定。Step 2〜Step 5 は土日も毎日実行する）。金曜起票の盤面 issue は月曜の Step 1 実行時まで open のまま残り、月曜が「前日以前の open な盤面 issue」として §1 を継承した上で close する（通常の平日フローと同じ経路）。

wrapper 内部の処理（引数は取らない。判定・組み立てはすべて script 側の責務）:

1. `gh issue list --repo Dayopt/dayopt --state open --label type:board --json number,title,body` で現在 open な盤面 issue を確認する
2. 応答に本日 JST の日付を含むタイトル「盤面 YYYY-MM-DD」が既にあれば、**起票済みとみなして skip**（指揮台の手動起票などとの重複を避け、冪等に倒す）
3. 無ければ、応答の中から前日以前の open な盤面 issue（通常 1 件）を探す
   - 見つかった場合: その `body` から `## 1. 今週の最優先` セクションの内容を抜き出す（当日 issue の §1 コピー元にする）
   - 見つからない場合（初回起票直後など）: §1 は空のまま起票する
4. `gh issue create --repo Dayopt/dayopt --title "盤面 YYYY-MM-DD" --body <body> --label type:board` で当日 issue を起票する。§1 は手順3の内容、§3〜§5 の検索リンクは当日 JST 日境界で埋める
5. 前日以前の issue が見つかっていれば、それだけを `gh issue close <番号> --repo Dayopt/dayopt --comment "本日分の盤面 issue へ移行: #<新issue番号>"` で close する（close 対象は wrapper が自分の検索結果から選んだ issue に限定され、呼び出し元が issue 番号を指定する余地は無い）
6. この Step の失敗（API エラー等）は以降の Step を止めない（fail-open）。失敗時は Step 5（運行記録）に「盤面起票失敗: <エラー概要>」を残す。盤面起票の欠落は指揮台の朝 sweep（[#2256](https://github.com/Dayopt/dayopt/issues/2256)）が backstop として拾う

**wrapper 化の理由（v2、[#2291](https://github.com/Dayopt/dayopt/issues/2291) 再設計）**: 旧実装は `gh issue create/close` を Bash tool から直接呼び、動的な本文（blockquote `>` や inline-code の backtick を含む正本テンプレ）が guard の redirect / `is_single_simple_command` 検査に触れて毎回 block されていた（自ガード衝突）。本文の組み立てを node script 内部に移し、`execFileSync` の argv 要素として gh へ渡すことで、値の中身が guard の shell 文字列検査に触れなくなる。詳細は §権限の構造的強制 参照。

### Step 2: 観測を実行する

次の 7 check-id を判定する。各項目は「実行コマンド + 判定」の対で、裁量の余地はない。

**fail-closed 原則（v2 追加）**: いずれかの観測コマンドが非 0 exit で終了する、またはレスポンスがパース不能なら、**緑と判定しない**。`<check-id>: 取得失敗` として Step 5 の運行記録へ必ず記録し、その run を「all green」と報告しない（§異常があれば起票または追記する の dedup 検索 fail-closed と対称の扱い。取得失敗は「異常なし」の代わりに「観測できず」として扱う）。**heavy-red / integration-red の「直近 run が未完了」は、この「取得失敗」とは別の状態として区別する**（#2350 クロスレビュー指摘、P2。コマンド自体は成功（exit 0・パース可能）しているため、`failed` ではなく Step 5 の `results` へ `{ checkId, outcome: "pending" }` として記録する。詳細は下記 heavy-red 参照）。

pending と「取得失敗（コマンド失敗）」を Claude 自身が同じラベルに合流させると、翌朝これを読む人間も、pending の escalation 判定（下記）を行う翌晩の Claude も、「gh 認証切れ」と「単に実行中」を区別できなくなる。両者は原因が異なるため必ず分離する。

**checklist v1**（[checklist.md](checklist.md) の 4 項目、番号順に実行。判定規約は不変）:

- **actual > baseline のみ異常**（赤）。actual ≤ baseline は正常
- actual < baseline の場合は正常だが、Step 5 の運行記録に「baseline 更新推奨（`<check-id>`: 現在値 N、baseline M）」を1行残す。baseline.json の更新は行わない（通常の PR レビューでのみ更新する review-gated ratchet）
- `docs-check` / `deadcode` は exit code のみで判定（baseline 不要、閾値は常に 0）

**heavy-post-merge 赤確認（check-id: `heavy-red`、v2 追加）**: `gh run list --workflow=heavy-post-merge.yml --limit 3 --json conclusion,status,headSha,createdAt,url` を実行する。**判定はまず直近 run（応答配列の先頭、gh run list は新しい順）の `status` を見る。`in_progress` / `queued`（未完了）なら判定を保留する**（#2341。GitHub Actions の scheduled workflow は数十分規模の遅延が日常的に起きるため、05:00 時点で直近 run がまだ実行中なだけのケースを、旧規約は無条件で赤と誤判定していた。判定境界の正本は `isLatestWorkflowRunPending`、`scripts/night-watch/lib.mjs`）。**直近 run が完了（`status: completed`）している場合のみ**、「直近 run に success 以外（`cancelled` / `timed_out` / `action_required` 等の終了状態）が含まれれば赤、または直近 24h に `conclusion=success` の run が 1 件も無ければ赤」と判定する。baseline 不要。heavy-post-merge は schedule（nightly 04:00 JST）と push:main が同一 concurrency group（`cancel-in-progress: true`）のため、nightly が main push で cancel され `conclusion=cancelled` になりうる（`conclusion=failure` だけを見ると緑と誤読する。この `cancelled` は `status: completed` の terminal conclusion であり、上記の未完了判定とは別物）。対象 workflow は nightly・push:main・手動 dispatch のすべての run を含む。異常検出時は該当 run の `url` を起票本文の再現手がかりとして使う

**pending の escalation（#2350 クロスレビュー指摘、P2-1）**: 未完了と判定したら、赤とせず即座に `results` へ `{ checkId: "heavy-red", outcome: "pending" }` を積むのではなく、その前に `node scripts/night-watch/run-log.mjs recent-pending heavy-red` を実行する。返り値 `{ consecutivePending: boolean, reportsChecked: number }` の `consecutivePending` が **true**（直近2晩分の運行記録コメントで `heavy-red` が連続 pending だった場合）なら、今晩は pending 扱いにせず**赤として起票する**（`node scripts/night-watch/alert-issue.mjs report heavy-red --evidence-url <直近runのurl>` を呼び、`results` には通常の起票結果 `{ checkId: "heavy-red", outcome: "issue", issueNumber: N }` を積む）。`consecutivePending` が false（2晩に満たない、または直近2晩のどちらかが pending でなかった）なら、通常どおり `{ checkId: "heavy-red", outcome: "pending" }` を積む（起票しない）。

これにより、単夜の遅延（#2341 が塞いだ誤起票）は保留のまま再発させず、かつ runner 枯渇・workflow 定義破損等で run が恒久的に完了しない class（旧設計では pending を無期限に積むだけで誰にも気づかれなかった）を 3 晩目に閉じる。

**`recent-pending` は常設運行記録 issue の直近コメントのうち、`authorAssociation` が OWNER/MEMBER/COLLABORATOR のものだけを対象にし、日付が異なる直近2件で判定する**（risk-reviewer 指摘、medium）。repo は 2026-09 private 化まで public のため、第三者が「night-watch 運行記録」形式の偽コメントを投げて escalation を誤発火・無音化させる余地を防ぐ。

**integration 赤確認（check-id: `integration-red`、[#2333](https://github.com/Dayopt/dayopt/issues/2333) 追加）**: `gh run list --workflow=integration.yml --branch main --limit 3 --json conclusion,status,headSha,createdAt,url` を実行する。判定規約は heavy-red と同一（未完了時の pending 扱いと escalation を含む。`node scripts/night-watch/run-log.mjs recent-pending integration-red` を使う。`integration.yml` も schedule（nightly 04:30 JST）と push:main が同一 concurrency group `cancel-in-progress: true` のため、cancelled/timed_out/action_required も赤、直近 24h に success が無ければ赤）。**integration.yml は heavy-post-merge.yml（60分の余裕）と異なり schedule〜夜勤起動の余裕が 30 分しかなく、未完了判定の実益が heavy-red より大きい**（#2341、実測の誤起票シナリオ）。**`--branch main` は必須**（push前反証レビュー risk-reviewer 指摘、P2）: `integration.yml` は `heavy-post-merge.yml` と異なり `pull_request` trigger も持つ（migration-safety job 用）ため、branch 指定が無いと直近 3 run に PR run が混入し、cancel-in-progress による誤起票・nightly success の窓外押し出し・本物の失敗の見逃しが同時に起こり得る。CI 4層再設計（[#2269](https://github.com/Dayopt/dayopt/issues/2269)）で `integration.yml` が per-PR から nightly + push:main 後の層3へ移った後、夜勤が heavy-post-merge の赤しか観測しておらず integration 単独の失敗が無通知のまま朝を迎える穴があった（非ブロッキング Codex レビュー指摘、P2）。異常検出時は該当 run の `url` を起票本文の再現手がかりとして使う

**Sentry 新規 issue スキャン（check-id: `sentry-new`、v2 追加）**: `sentry issue list dayopt --query "is:unresolved age:-24h"` を実行し、直近 24h に新規発生した unresolved production issue の件数を数える。**この cloud 互換形（env の `SENTRY_AUTH_TOKEN` を直接使う）が夜勤 Routine（Cloud Environment 実行）の既定形**（[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント、scope 追加5点目）。1Password が使えない Cloud Environment では `op run --` ラッパー自体が不要かつ実行不可能なため、Cloud Environment 側の env として `SENTRY_AUTH_TOKEN` を直接注入する（層1/2 と同じ、本 skill の実装 scope 外の登録前提）。`SENTRY_AUTH_TOKEN="op://agent/sentry-cli-readonly/credential" op run -- sentry issue list dayopt --query "is:unresolved age:-24h"`（旧形）は 1Password が使えるローカル環境（指揮台の手動代行）専用として allowlist に残す。**件数 > 0 のみ異常**（baseline 不要、閾値は常に 0）。**個別 triage はしない** — 列挙して Step 3 で起票し、朝のレーンへ渡すだけ。**public repo への raw データ露出を禁止する**（high、v2 で明記。repo は 2026-09 private 化まで public のまま）: Sentry issue の title / culprit / message には user email・OAuth callback query・Supabase エラー詳細等が混入しうる。Step 3 の起票本文へ転記してよいのは **件数・short ID（`DAYOPT-XXX`）・Sentry issue URL のみ**。title / culprit / message の生テキストは issue へ書かない

### Step 3: 異常があれば起票または追記する

Step 2 の 7 check-id すべてを対象に、異常があった check-id ごとに `node scripts/night-watch/alert-issue.mjs report <check-id> [--actual N] [--evidence-url URL] [--count N] [--evidence "DAYOPT-<番号> <Sentry issue URL>"]` を実行する（**check-id 単位で 1 issue**。同一 check-id 内の複数件の異常は 1 issue に列挙する。例: dependabot alerts が同時に3件増えても issue は1件）。渡す flag は check-id の kind ごとに決まる（`docs-check` / `deadcode` は exit-code kind で追加 flag 不要、`docs-coverage` / `dependabot-alerts` は `--actual`、`heavy-red` / `integration-red` は `--evidence-url`、`sentry-new` は `--count` + `--evidence`。詳細は `scripts/night-watch/alert-issue.mjs` の `CHECK_DEFINITIONS`）。

wrapper 内部の処理:

1. `gh issue list --repo Dayopt/dayopt --state open --search "nightwatch(<check-id>): in:title" --json number,title` で既存 open issue を検索する
2. **検索コマンドがエラーで失敗したら、起票しない**（fail closed。原因不明のまま重複起票するリスクを避ける。`alert-issue.mjs` は `{ action: 'skipped', reason: 'dedup検索失敗のため起票見送り' }` を返すので、Step 5 の `results` へ `{ checkId: '<check-id>', outcome: 'skipped', reason: 'dedup-search-failed' }` として記録する）
3. 既存 open issue があればコメントで実測値・閾値・再現コマンドを追記する
4. 無ければ新規起票する（テンプレートは下記。タイトルは `CHECK_DEFINITIONS` の固定文言のみを使い、Claude が渡す自由文字列を混ぜない）
5. **1 run あたりの新規起票上限は3件。加えて、同一 check-id は 1 run につき 1 回（新規起票・追記を問わず）までしか action しない。** どちらも `alert-issue.mjs` 内部（`reserveAlertRunSlot`、`scripts/night-watch/lib.mjs`）が OS tmpdir の run-scoped state で機械強制する（[#2332](https://github.com/Dayopt/dayopt/issues/2332)。呼び出し元（Claude）は上限の存在を意識する必要が無く、超過分は wrapper が `{ action: 'capped', reason: 'run-cap-reached' }` を返して gh を呼ばない）。前者（新規起票 3 件）は誤登録・想定外の大量検出の機械的減衰、後者（check-id 単位 1 回）は同一 check-id への `report` 繰り返し呼び出し（prompt injection 等）による無制限追記を class ごと閉じる。state は TTL（60 分）でスコープし、JST 暦日ではない（Routine が run 途中で死んだ日の手動代行が前 run の残り予算を引き継がないため）。超過分は Step 5 の `results` へ `{ checkId: '<check-id>', outcome: 'skipped', reason: 'run-cap-reached' }` として記録する（point 2 の `dedup-search-failed` と同じ schema）
6. ラベルは既存体系のみ使う（`type:chore` / `area:operations` / `priority:p2` を既定とする。新ラベルは作らない）。milestone は付けない（着手時に指揮台が付与する既存運用に従う）

**`--actual` / `--evidence-url` / `--count` / `--evidence` の値は wrapper 内部で形を検証する**（数字のみ / 既知の GitHub Actions run URL のみ / `DAYOPT-<番号> <Sentry issue URL>` の空白区切りペアのみ）。Sentry issue の生 title / culprit / message はこの検証を通らないため、§守ること の禁止（raw title/culprit/message を issue 本文へ転記しない）が機械的に強制される。

**起票テンプレート**（wrapper が組み立てる。手で書かない）:

```markdown
## night-watch 検出: <check-id>

**実測値**: <actual>
**閾値/baseline**: <baseline>
**再現コマンド**: `<command>`
**検出日時**: <UTC timestamp>

baseline は `.claude/skills/night-watch/baseline.json` に固定。更新は通常の PR レビューでのみ行う。
```

タイトル: `nightwatch(<check-id>): <CHECK_DEFINITIONS の固定文言>`

### Step 4: DoD 監査候補の乱数選定（v2 追加）

`dispatch` skill 操作C §ランダム抽出監査 の**候補提示のみ**を夜勤へ移す（監査そのものは引き続き User が行う。指揮台/夜勤は候補を提示するだけで採否を判断しない）。`node scripts/night-watch/dod-candidate.mjs select` を実行する。

**土日は skip する**（[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント）。Step 1（盤面起票）が平日のみのため、JST 土曜・日曜は当日盤面 issue という宛先自体が存在しない。gh を一切呼ばずに `{ action: 'skipped', reason: 'weekend' }` を返す（`isJstWeekend` 判定。当日盤面 issue が見つからない時に例外を投げる既存の fail-closed 挙動は、平日なのに Step 1 が未完了という異常時のためのもので変わらない）。

**月曜は対象窓を金〜日の JST 3 日分へ拡張する**。土日は Step 4 自体が skip されるため、「前日 JST」の単日窓のままだと金・土曜に merge された PR が DoD 監査候補から永久に漏れる。`isJstMonday` 判定で `fetchWeekendCatchUpMergedPrs`（金〜日 3 日分）へ切り替える（通常日は `fetchYesterdayMergedPrs` のまま）。

wrapper 内部の処理（引数は取らない）:

1. `gh pr list --repo Dayopt/dayopt --search "is:merged merged:<対象JST日境界レンジ>" --state merged --json number,title --limit 30` で対象窓（通常日は前日 JST 単日、月曜は金〜日の JST 3 日分）に merge された PR 一覧を取得する
2. 0 件なら、当日盤面 issue（Step 1 と同じ検索で自分で見つける）へ「DoD候補: 前日merge PR無し」の 1 行をコメントする
3. 1 件以上あれば一覧から 1 本を選ぶ。選定に決定的なアルゴリズムは設けない（セッションごとの応答のばらつきをそのまま使う。低リスクな候補提示のため、再現可能な乱数生成器は不要と判断）
4. 当日盤面 issue へ「DoD監査候補: #<選定PR番号>（<PRタイトル>）」をコメントする

**実装の是正（v2 再設計、2026-08-24 実測）**: 旧手順は `gh search issues --search "..."` を使っていたが、`gh search issues` には `--search` flag が存在せず（`unknown flag: --search`）常に失敗していた（PR #2309 未解決 thread #3）。加えて `merged:YYYY-MM-DD` の日単位指定は GitHub 検索の UTC 日境界になり、JST 0-9 時台の PR が前後の日に混入する（同 thread #4）。正しい形は `gh pr list --search "is:merged merged:<JST明示範囲>" --state merged`（`-S/--search` は `gh pr list` の正式 flag）で、`scripts/night-watch/dod-candidate.mjs` が実測確認済みの形で実装する。

### Step 5: 運行記録

`node scripts/night-watch/run-log.mjs report '<OpsLogReport JSON>'` を実行する。常設運行記録 issue（初回登録時に指揮台が issue 番号を確定する。issue 番号は `docs/operations/night-watch.md` に記録する。wrapper が同ファイルから自分で読み取り、呼び出し元は宛先 issue 番号を指定しない）へ、その晩の実行内容を要約した 1 コメントを必ず残す。Step 0 で中断した場合はこの Step の代わりに `run-log.mjs env-failure` を実行済み（§Step 0 参照）。

JSON の形（wrapper 内部で厳密に検証する。既知 check-id 以外・範囲外の数値・不正な status は例外を投げて gh を呼ばない）:

```json
{
  "executed": 7,
  "failed": ["<check-id>", ...],
  "results": [
    { "checkId": "<check-id>", "outcome": "green" }
    | { "checkId": "<check-id>", "outcome": "pending" }
    | { "checkId": "<check-id>", "outcome": "issue", "issueNumber": 1234 }
    | { "checkId": "<check-id>", "outcome": "skipped", "reason": "dedup-search-failed" | "run-cap-reached" }
  ],
  "baselineRecommend": ["<check-id>", ...],
  "board": { "status": "success", "issueNumber": 1234 } | { "status": "skip" } | { "status": "weekend" } | { "status": "fail", "reason": "auth-error" | "rate-limited" | "network-error" | "invalid-response" | "unknown" },
  "dod": { "status": "candidate", "prNumber": 1234 } | { "status": "none" } | { "status": "weekend" }
}
```

**`board.reason`（Step 1 の盤面起票が失敗した時の理由）は既知 enum のみで、gh CLI の生エラーメッセージをそのまま渡してはいけない**（push 前反証レビュー risk-reviewer / behavior-verifier + 非ブロッキング Codex レビューが独立に検出、P1）。旧設計は自由文字列（文字集合の denylist で検証）だったが、prompt injection を受けたセッションが Sentry issue の raw title/message（user email 等を含みうる）を 300 文字ずつ小分けにして public な常設運行記録 issue へ書く経路になり得た。自由文字列である限り、安全な文字だけで構成された機微情報の断片は文字集合の denylist では塞げない。実際に発生した gh CLI エラーを `auth-error` / `rate-limited` / `network-error` / `invalid-response` / `unknown` のいずれかへ分類してから渡す。`results` の `outcome: "skipped"` の `reason` も同様に既知 enum（`dedup-search-failed` / `run-cap-reached`）のみ。

**`board.status` / `dod.status` の `"weekend"` は JST 土日専用**（#2342）。Step 1（盤面起票）・Step 4（DoD候補選定）は `isJstWeekend` 判定で土日に gh を一切呼ばず skip する（§Step 1・§Step 4 参照）。この skip は `board.status: "skip"`（起票済み・重複回避）や `dod.status: "none"`（前日merge PR無し）とは意味が異なるため、Claude は土日の運行記録でこれらへ丸めず `"weekend"` を渡す（丸めると「盤面起票: skip（起票済み）」「DoD監査候補: 前日merge PR無し」という事実と異なる文言が毎週2回残る）。**`"weekend"` は実際の JST 曜日とクロス検証される**（#2350 クロスレビュー指摘、P3）: **今日または昨日（JST）が土日**なら通す（今日のみに限定すると、指揮台が土曜分の観測を翌月曜に手動代行で catch-up 投稿した時に throw し、唯一の故障検出チャネルが無音化するため。risk-reviewer 指摘）。今日・昨日ともに平日なら wrapper が例外を投げて gh を呼ばない。

**`results` の `"pending"`（heavy-red / integration-red の直近 run 未完了）は `"取得失敗"`（コマンド自体の失敗）とは別の状態**（#2350 クロスレビュー指摘、P2-1。詳細は §Step 2 heavy-red 参照）。追加フィールド不要。

wrapper はこの JSON から、以下と同じ内容のコメント本文を組み立てて投稿する:

```markdown
**night-watch 運行記録 YYYY-MM-DD**

- 実行 check 数: N / 7（取得失敗を除く）
- 取得失敗: <check-id> があれば列挙（コマンド非0 exit / パース不能）、無ければ「なし」
- all green | 起票/追記: #NNNN（<check-id>）, ... | 保留（run未完了）: <check-id>, ... | 見送り: <check-id>（<reason>）, ... | 取得失敗のみ（起票/追記なし）
- baseline 更新推奨: <check-id> があれば列挙、無ければ「なし」
- 盤面起票: 成功（#NNNN）| skip（起票済み）| skip（土日）| 失敗（<reason>）
- DoD監査候補: #NNNN | 前日merge PR無し | skip（土日）
- 起票予算 state: 有効（新規起票 N/3、対応済み check-id M件）| 利用不可（fail-open、無制限扱いで実行）
```

**最後の「起票予算 state」行は Claude が渡す report JSON には含まれず、wrapper（`run-log.mjs` の `runOpsLogReport`）が §Step3 point 5 の run-scoped state file を自分で直接読んで機械生成する**（[#2332](https://github.com/Dayopt/dayopt/issues/2332)。`buildAlertBudgetLine`、`scripts/night-watch/run-log.mjs`）。Claude の自己申告に頼らず、state 機構が無音で無効化される fail-open クラスを Step 5 で観測可能にする。「利用不可」が出た朝は state file の read/write が失敗している徴候なので、night-watch の実行環境（tmpdir の書き込み可否）を指揮台が確認する。

**取得失敗が 1 件でもあれば「all green」と報告しない**（fail-closed。§Step 2 観測を実行する 参照）。`failed` が非空、または `results` に `outcome: "issue"` / `"skipped"` が 1 件でもあれば、wrapper は自動的に「起票/追記」「見送り」またはその両方の列挙（`failed` のみで `results` が空の場合は「取得失敗のみ（起票/追記なし）」）へ切り替える（push 前反証レビュー + 非ブロッキング Codex レビュー指摘、P2。`failed` 非空でも `results` が空だと誤って「all green」と報告していた）。

**さらに**、`node scripts/night-watch/run-log.mjs board-note '<BoardNote JSON>'`（`{"allGreen": true|false, "issued": N, "observed": M}`）を実行し、Step 1 で起票/確認した当日盤面 issue へ「⏱ 夜勤: all green | 起票 N 件 / 観測 7 件」（取得失敗があれば「⏱ 夜勤: 一部取得失敗 | 起票 N 件 / 観測 M 件」）の 1 行コメントを追加する（`.claude/rules/orchestration.md` §日次盤面issue のイベントコメントと同じタイムライン形式に合わせる。宛先の当日盤面 issue も wrapper が自分で検索する）。**この board-note も Step 1 と同じく平日のみ実行する**（[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント、push前反証レビュー risk-reviewer 指摘。土日は当日盤面 issue という宛先自体が存在しないため、gh を一切呼ばずに `{ action: 'skipped', reason: 'weekend' }` を返す）。

## 権限の構造的強制（3層防御）

「規律で守る」だけでは足りないという #2205 の User 要件に応じ、次の3層で「Edit / Write / git push / PR 作成の実行不能」を保証する。層1・層2はこの skill の実装 scope 外（登録は指揮台が行う）だが、**登録時の必須要件としてここに固定する**:

- **層1（GitHub token scope、登録時に指揮台が設定）**: night-watch 専用 token を `issues:write` + `contents:read` + `Dependabot alerts: read` + `Actions: read`（v2 追加。`gh run list` に必要）+ `Pull requests: read`（v2 再設計で追加。Step 4 の `gh pr list --search`（`scripts/night-watch/dod-candidate.mjs`）に必要。無いと登録直後は気づかれず、Step 4 が unattended 実行時に静かに失敗する — 登録時の dry-run で `gh pr list --search "is:merged" --state merged --limit 1` の疎通を確認する）のみに scope する。`contents:write` / `pull_requests:write` / `administration` を持たせない。push・PR作成が API レベルで不可能になる。**Sentry CLI の認証は別トークン**（`SENTRY_AUTH_TOKEN`、1Password `sentry-cli-readonly` item、read-only scope）で、GitHub token scope には影響しない
- **層2（Cloud trigger 設定、登録時に指揮台が設定）**: RemoteTrigger の `session_context.allowed_tools` から `Write` / `Edit` / `MultiEdit` / `NotebookEdit` を除外する。**model は Haiku を指定する**（v2 追加。夜勤の判定は exit code / 閾値比較のみで裁量が無いため Haiku の適性と一致する。RemoteTrigger 側で model 指定ができない場合は、prompt 冒頭に「軽量実行（判定のみ、裁量なし）」と明記して代替し、実際に使われた model の構成比を月次ガーデニングで実測検証する）
- **層3（repo hook、本実装）**: `.claude/hooks/pre-tool-guard-impl.sh` が `DAYOPT_NIGHT_WATCH=1` を検出した時のみ有効になる **allowlist**（denylist ではない — `.claude/rules/workflow.md` §同型指摘の打ち切りの「denylist をやめて allowlist にする」に従う）。引数不要な固定コマンド（checklist.md の4コマンド `docs:check` / `docs:coverage` / `quality:deadcode:ci`、自己検証の2コマンド `echo $DAYOPT_NIGHT_WATCH` / `gh api .../permissions`、v2 で追加した heavy-post-merge 赤確認の1コマンド・Sentry スキャンの2コマンド（cloud 既定形 + 指揮台の手動代行用 op run 形、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメントで追加）、[#2333](https://github.com/Dayopt/dayopt/issues/2333) で追加した integration 赤確認の1コマンド）は **完全一致**でのみ許可する（末尾ワイルドカードは配下バイナリの書込フラグ `--fix` `--output=` 等を継承してしまうため使わない、2026-08-19 内製クロスレビューで実測確認）。`gh api repos/Dayopt/dayopt/dependabot/alerts` も checklist.md の固定コマンドと完全一致でのみ許可する。`>` / `<` を含むコマンドは redirect によるファイル書き込みを防ぐため無条件で拒否する。read-only git（status/log/diff等）は checklist が実際には使わないため allowlist に含めない（未使用の攻撃面は追加せず、必要になった時に個別評価する）。それ以外は fail closed。env var が無いセッション（通常の全レーン）には一切影響しない

  **動的な値（issue タイトル・本文・検索クエリ・close 対象）が要る書き込みは gh を直接許可せず、`scripts/night-watch/*.mjs` の wrapper だけを許可する**（v2 再設計、[#2291](https://github.com/Dayopt/dayopt/issues/2291)。PR #2309 未解決 thread #5 の是正）。旧実装は `gh issue create/comment/list/view/close` と `gh search issues` を、コマンドごとに許可 flag を列挙した positive allowlist（トークン単位で `-` から始まる語は許可 flag と完全一致しない限り拒否）で判定していたが、quote/backslash を削るだけの二重検査では shell 展開（ANSI-C escape `$'…'`、変数展開 `${IFS}` 等）を再現できず、2026-08-21 に未許可 flag（`--body-file`）を smuggle する攻撃が実測された。wrapper 方式では `node scripts/night-watch/board-issue.mjs sync` / `node scripts/night-watch/dod-candidate.mjs select` / `node scripts/night-watch/run-log.mjs env-failure <no-var|write-token>` を完全一致で、`node scripts/night-watch/alert-issue.mjs report <check-id> ...` / `node scripts/night-watch/run-log.mjs report ...` / `node scripts/night-watch/run-log.mjs board-note ...` / `node scripts/night-watch/run-log.mjs recent-pending <check-id>`（#2350、pending escalation 判定の read-only wrapper。§Step 2 heavy-red 参照）を固定 prefix のみで許可する（flag 単位の検証はしない）。値は wrapper 内部で `execFileSync` の argv 要素として gh へ直接渡るため shell を経由せず、guard は「本当にこの固定 script を単純呼び出ししているか」（`is_single_simple_command` + no-redirect、本節冒頭の既存規則）だけを見れば足りる。値の形（数字のみ・既知の URL 形式のみ・`DAYOPT-<番号> <URL>` の空白区切りペアのみ・`run-log.mjs` の JSON は既知 check-id / 範囲内の数値 / 既知の status のみ）は各 wrapper 内部の責務（`scripts/night-watch/*.test.ts` が契約を固定する）

  **層3は Write/Edit も無条件で拒否する**（v2 追加、push 前反証レビュー risk-reviewer 指摘）。層2（allowed_tools からの除外）が唯一の防御だと、その設定漏れ時に agent が `scripts/night-watch/*.mjs`（layer3 が prefix 一致で信頼している node script）や本 hook 自体を書き換えてから、信頼されたコマンド名で実行するだけで任意コード実行 / guard 無効化に到達できる。SKILL.md が明言する「夜は書かない」を、layer3 でも class ごと閉じる形（Write/Edit という tool 種別を丸ごと拒否）で機械強制し、層2 の設定漏れに対する defense-in-depth にする。

層1・2は登録ミスを機械的に検出できない外部状態のため、**層3だけが CI で継続的に検証される担保**。Step 0 の自己検証と合わせて、層1・2の設定漏れを「無音の素通り」から「観測可能な異常」に変える。

**登録前提（v2 追加、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメントで cloud 既定形へ改訂）**: Routine 登録時に、層2の `session_context.allowed_tools` が `Bash(sentry issue list ...)`（`sentry-new` の cloud 既定形。旧 `Bash(op run ...)` は Cloud Environment に 1Password が無く実行不可能なため、Routine の allowed_tools としては不要）と `Bash(gh run list ...)` と `Bash(node scripts/night-watch/*.mjs ...)` を含むことを dry-run で確認する。含まないと Step 2 の `sentry-new`（`sentry issue list ...`）/ `heavy-red`・`integration-red`（`gh run list`）、または Step 0/1/3/4/5 の wrapper 呼び出しが unattended 実行時に prompt 待ちで停止する。**この行を根拠に allowed_tools を再登録する時、旧 `Bash(op run ...)` だけを許可して cloud 既定形を許可し忘れると、sentry-new が unattended 実行で無音停止する**（push前反証レビュー risk-reviewer 指摘、P2。層1/2 は外部状態で CI 検証が効かないため、この停止は朝の sweep まで検出されない）。`Bash(op run ...)` は指揮台が 1Password の使えるローカル環境で手動代行する時のみ必要。層2 allowed_tools の具体的な登録内容・repo permissions との重なりの検証自体は登録ゲート（[#2231-A](https://github.com/Dayopt/dayopt/issues/2231)）の scope。

## 故障モード

- **常設運行記録 issue に前夜コメントが無い** — 朝の編成 sweep（`.claude/rules/orchestration.md` §1 日サイクル）で検出する。Routine 故障を疑い、`RemoteTrigger(action: "list_runs")` で状態を確認し、必要ならこの skill で手動代行する
- **Step 0 の自己検証が継続的に失敗する** — 層1・2の登録設定を指揮台が再確認する（本 skill の実装範囲外の外部状態）
- **Sentry org slug（`dayopt`）が変わる** — `SENTRY_EVIDENCE_RE`（`scripts/night-watch/alert-issue.mjs`）の subdomain は固定文字列なので、org slug が変われば `sentry-new` の evidence が全件拒否され、件数のみの起票すら出せなくなる（push前反証レビュー risk-reviewer 指摘、P3）。org slug 変更時は `SENTRY_EVIDENCE_RE` と `CHECK_DEFINITIONS['sentry-new'].command` の org 名を同時に更新する

## 守ること

- checklist の変更は通常の PR レビューを通す（Routine 自身は checklist.md も baseline.json も編集しない）
- baseline.json の更新は通常の PR のみ。夜勤セッションは読むだけ
- 新ラベルを作らない。既存体系（`docs/operations/github-labels.md`）のみ使う
- **書き込み先は常設運行記録 issue と当日/前日の盤面 issue（`type:board`）に限る**（v2 で拡張）。盤面 issue への書き込みは Step 1（起票・前日分の close）・Step 4（DoD候補コメント）・Step 5（タイムラインコメント）に限定する。それ以外の issue のラベル変更・close・PR操作は一切行わない
- Sentry issue の個別 triage（`resolve` 等の write 操作、担当割り当て）は行わない。列挙して起票するだけ
- **Sentry issue の raw title / culprit / message を issue 本文へ転記しない**（v2 追加、high）。public repo（2026-09 private 化まで）に user email・OAuth callback query 等が露出する経路になるため。載せてよいのは件数・short ID・Sentry issue URL のみ
- Step 2 の観測コマンドが取得失敗（非 0 exit / パース不能）の場合、緑と判定せず `<check-id>: 取得失敗` を Step 5 へ記録する（v2 追加、fail-closed）
