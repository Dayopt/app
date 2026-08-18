---
name: night-watch
description: 計測夜勤 Routine の障害時に手動代行する時、または夜勤 checklist の追加・変更を検討する時に発動。read-only の機械判定チェックリストを実行し、赤なら 1 異常 = 1 issue で起票、常設運行記録 issue へ毎晩 1 コメントする。夜間の自動実行そのものは Claude Routine の scheduled trigger が本ファイル §自動パートを直接参照して行い、この skill の invocation 経路ではない。
---

# night-watch（計測夜勤）

夜間に read-only の品質観測を行う Routine（Claude Code Cloud の scheduled trigger、毎晩、fresh session）。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205) の 2026-08-19 決定コメント。実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)。

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

いずれかが想定外なら、**checklist を一切実行せず**、常設運行記録 issue へ「環境故障: DAYOPT_NIGHT_WATCH 未検出」または「環境故障: token に write 権限あり」の 1 コメントを残して終了する。これは checklist の異常とは別枠で、次回実行時も同じ状態なら毎晩同じ内容で報告し続ける（dedup の対象にしない — 環境故障は毎晩観測されるべき）。

### Step 1: checklist v1 を実行する

[checklist.md](checklist.md) の 4 項目を番号順に実行する。各項目は「実行コマンド + 判定」の対で、裁量の余地はない。判定規約:

- **actual > baseline のみ異常**（赤）。actual ≤ baseline は正常
- actual < baseline の場合は正常だが、運行記録コメントに「baseline 更新推奨（`<check-id>`: 現在値 N、baseline M）」を1行残す。baseline.json の更新は行わない（通常の PR レビューでのみ更新する review-gated ratchet）
- `docs-check` / `deadcode` は exit code のみで判定（baseline 不要、閾値は常に 0）

### Step 2: 異常があれば起票または追記する

check-id ごとに次を行う（**check-id 単位で 1 issue**。同一 check-id 内の複数件の異常は 1 issue に列挙する。例: dependabot alerts が同時に3件増えても issue は1件）:

1. `gh search issues --repo Dayopt/dayopt --state open --search "nightwatch(<check-id>): in:title"` で既存 open issue を検索する
2. **検索コマンドがエラーで失敗したら、起票しない**（fail closed。原因不明のまま重複起票するリスクを避ける。運行記録に「<check-id>: dedup検索失敗のため起票見送り」と記録する)
3. 既存 open issue があれば `gh issue comment` で実測値・閾値・再現コマンドを追記する
4. 無ければ `gh issue create` で新規起票する（テンプレートは下記）
5. **1 run あたりの起票上限は3件。** 超過分は起票せず、運行記録コメントに集約して報告する（誤登録・想定外の大量検出を機械的に減衰させるため）
6. ラベルは既存体系のみ使う（`type:chore` / `area:operations` / `priority:p2` を既定とする。新ラベルは作らない）。milestone は付けない（着手時に指揮台が付与する既存運用に従う）

**起票テンプレート**:

```markdown
## night-watch 検出: <check-id>

**実測値**: <actual>
**閾値/baseline**: <baseline>
**再現コマンド**: `<command>`
**検出日時**: <UTC timestamp>

baseline は `.claude/skills/night-watch/baseline.json` に固定。更新は通常の PR レビューでのみ行う。
```

タイトル: `nightwatch(<check-id>): <一言概要>`

### Step 3: 運行記録

常設運行記録 issue（初回登録時に指揮台が issue 番号を確定する。issue 番号は `docs/operations/night-watch.md` に記録する）へ、その晩の実行内容を要約した 1 コメントを必ず残す。Step 0 で中断した場合もこのコメントは残す（環境故障として）。

コメント形式:

```markdown
**night-watch 運行記録 YYYY-MM-DD**

- 実行 check 数: N / 4
- all green | 起票/追記: #NNNN（<check-id>）, ...
- baseline 更新推奨: <check-id> があれば列挙、無ければ「なし」
```

## 権限の構造的強制（3層防御）

「規律で守る」だけでは足りないという #2205 の User 要件に応じ、次の3層で「Edit / Write / git push / PR 作成の実行不能」を保証する。層1・層2はこの skill の実装 scope 外（登録は指揮台が行う）だが、**登録時の必須要件としてここに固定する**:

- **層1（GitHub token scope、登録時に指揮台が設定）**: night-watch 専用 token を `issues:write` + `contents:read` + `Dependabot alerts: read` のみに scope する。`contents:write` / `pull_requests:write` / `administration` を持たせない。push・PR作成が API レベルで不可能になる
- **層2（Cloud trigger 設定、登録時に指揮台が設定）**: RemoteTrigger の `session_context.allowed_tools` から `Write` / `Edit` / `MultiEdit` / `NotebookEdit` を除外する
- **層3（repo hook、本実装）**: `.claude/hooks/pre-tool-guard-impl.sh` が `DAYOPT_NIGHT_WATCH=1` を検出した時のみ有効になる **allowlist**（denylist ではない — `.claude/rules/workflow.md` §同型指摘の打ち切りの「denylist をやめて allowlist にする」に従う）。許可されるのは checklist.md の4コマンド、`gh issue create/comment/list/view`、`gh search issues`、`gh api repos/Dayopt/dayopt/dependabot/alerts`（GET固定）、read-only git（status/log/diff/show）だけ。`>` / `<` を含むコマンドは redirect によるファイル書き込みを防ぐため無条件で拒否する。それ以外は fail closed。env var が無いセッション（通常の全レーン）には一切影響しない

層1・2は登録ミスを機械的に検出できない外部状態のため、**層3だけが CI で継続的に検証される担保**。Step 0 の自己検証と合わせて、層1・2の設定漏れを「無音の素通り」から「観測可能な異常」に変える。

## 故障モード

- **常設運行記録 issue に前夜コメントが無い** — 朝の編成 sweep（`.claude/rules/orchestration.md` §1 日サイクル）で検出する。Routine 故障を疑い、`RemoteTrigger(action: "list_runs")` で状態を確認し、必要ならこの skill で手動代行する
- **Step 0 の自己検証が継続的に失敗する** — 層1・2の登録設定を指揮台が再確認する（本 skill の実装範囲外の外部状態）

## 守ること

- checklist の変更は通常の PR レビューを通す（Routine 自身は checklist.md も baseline.json も編集しない）
- baseline.json の更新は通常の PR のみ。夜勤セッションは読むだけ
- 新ラベルを作らない。既存体系（`docs/operations/github-labels.md`）のみ使う
- 常設運行記録 issue 以外への書き込み（他 issue のラベル変更・close・PR操作）は一切行わない
