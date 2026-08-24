---
name: dispatch
description: GitHub issue を worker（Sonnet などの委譲先モデル）へ渡す準備をする時、非 feature 作業の issue を新規起票する時、epic の sub-issue 構成や `status:*` ラベルを更新する時、`status:blocked` の凍結 issue への着手が話題になった時、並行作業の定期棚卸し（sweep）や凍結解除を行う時に発動。凍結・衝突チェック、handoff-quality 補強、既存ラベル体系を適用する。issue の中身の実装作業そのものや、docs ログ作成（/decision・/note の領域）では発動しない。
---

# Dispatch Skill

feature 開発と並行する非 feature 作業を issue ベースで回す指揮者（conductor）の定常運用。**どのモデル（Opus / Sonnet / それ以降）でも実行できる**ことを前提に、判断基準をすべて本ファイルに明文化する。個人メモリや特定モデルの記憶に依存しない。

**正（source of truth）**: 状態は **GitHub issue 自身**が持つ。open / closed に加えて `status:ready` / `status:in-progress` / `status:review` / `status:blocked` / `status:watching` のラベルが着手可否を表し、大きなテーマは `scope:epic` の issue が sub-issues で束ねる。全体俯瞰は rollup issue を読むのではなく、`scope:epic` 一覧 + `status:*` クエリで都度組み立てる。

**rollup tracking issue は廃止した**（2026-08-01、#1788 を close。経緯は [2026-08-01-issue-state-labels-epics.md](../../../docs/engineering/log/2026-08-01-issue-state-labels-epics.md)）。後継 rollup は作らない。本ファイルは「手順」、issue とラベルが「状態」。

**履歴もコメントに落とす。** dispatch の記録（操作 A 手順 6）に加えて、checkpoint report、判断分岐（`judgment:diverged`。`.claude/rules/orchestration.md` §判断ジャーナル）、レーンからの完了報告も、該当 issue のコメントとして残す。指揮台セッションは transcript に状態を持たないため（`orchestration.md` §盤面の正本は issue + open PR）、issue コメントが唯一の永続履歴になる。

## When to Use

以下の状況で発動:

- worker に渡す issue を選定・準備する時（→ 操作 A）
- 非 feature 作業（refactor / security / ops / content）の issue を新規起票する時（→ 操作 B）
- epic issue の sub-issue 構成や、issue の `status:*` ラベルを更新する時
- 定期棚卸し（sweep）や凍結解除（unfreeze）を明示依頼された時（→ 操作 C / D）
- 提案・plan の中に `status:blocked` 付き issue への着手が含まれているのを検出した時（凍結違反の防止）
- issue 化されていない作業（監査ログの残タスク、alert、会話中の口頭依頼）がセッション内に現れた時

## When NOT to Use

- 各 issue の中身の実装作業そのもの（issue 本文の受け入れ条件と、該当する project skill に従う）
- 意思決定ログ・調査ログの作成（/decision・/note コマンドの領域）
- feature 実装 plan の策定（`.claude/rules/plan-format.md` に従う。dispatch は「誰に渡すか」だけを扱う）

## 操作 A: dispatch — issue を worker に渡す

1. `gh issue list --milestone <現行milestone> --label status:ready --state open` で候補を選ぶ（ユーザー指定があればそれを優先）。milestone 内が空なら `--label status:ready --state open` 全体から。テーマ単位で見たい場合は該当 `scope:epic` issue の sub-issues から絞る。**`gh issue list` は既定で open のみ返すためこの経路では実害が薄いが、epic issue のコメント経由・issue 番号の直指定など一覧以外の経路で候補を得た場合はこの既定に頼れない。** リスト以外の経路で得た候補ほど、次の state 確認（手順 4）を必ず通す
2. **束ね**: 関連する issue（同一 area / 同一機能系統）は 1 worker セッション・1 branch・1 PR にまとめて渡すのを標準とする（`.claude/rules/workflow.md` §PR 粒度）。1 issue ずつ切り出さない
3. **衝突チェック**: 候補 issue が触るファイル・ディレクトリを、(a) 進行中 feature の設計書（例: `docs/projects/mcp-plan-track-learn/` の該当 Step）の対象、(b) 他の in-progress issue（`status:in-progress` ラベル）の対象、と突合する。**重なる場合は同一 worker に束ねて直列で処理するのを第一候補**とする（並行させない理由が衝突回避なら、束ねる方が安全かつ安価）。束ねられない場合だけ次の候補へ
4. **凍結・state チェック**: `status:blocked` が付いていないこと、かつ候補 issue の `state` が OPEN であることを確認する。state は `gh issue view <N> --json state` の実測を根拠にする（close 済み issue にも `status:ready` 等のラベルが残留しうるため、**ラベルは state の代わりにならない**）。束ねた場合は全 issue について両方確認する。1 つでも凍結 or close 済みなら、その issue だけ束ねから外す（2026-08-12、close 済み #1895 への誤 dispatch を受けて state 確認を追加。経緯は #1957）
5. issue 本文を **handoff-quality** に補強する（下記テンプレート）。worker が repo 探索なしで着手できる密度が基準
6. `status:ready` を `status:in-progress` へ差し替え、**その issue 自身**にコメントで dispatch 先（Sonnet / その他）を記録する。束ねた場合は代表 issue にコメントし、他は代表へリンクする。**この着手のタイミング（レーンへの割り当て、または PR の Closes に載せた時点）で、対象 issue に現行 milestone を付与する**（2026-08-12。編成時（操作 B 手順 5）の「押し込むか」の判断とは独立に、着手 = 付与を機械的に行う。経緯は #2006）。**レーンが draft PR を作成した時点で、PR 自身にも現行 milestone を付与する**（2026-08-13。issue 側だけでなく PR 側にも milestone が付いていると、release notes 作成時の merged PR 集計と盤面把握が楽になる。経緯は #2065）。**この dispatch コメントに DoD（完了の定義）を 1〜3 行で記載する**（2026-08-20、[#2273](https://github.com/Dayopt/dayopt/issues/2273)。「仕様には適合しているが意図とズレている」静かな失敗は User にしか捕まえられないため、operations C の日次棚卸しで行うランダム抽出監査（下記）が意図との整合を確認できるよう、着手時点の意図を issue コメントに固定しておく。束ねた場合は代表 issue のコメントへ一括で書く）
7. worker への指示は issue URL + 「本文の受け入れ条件と検証コマンドに従う」だけで済む状態にする。着手手順・PR 規約・報告テンプレート・検証原則はチップ prompt へ個別に書き下さず `.claude/rules/lane-protocol.md` への参照 1 行で足りる（§チップ prompt の標準形）

### handoff-quality テンプレート（issue 本文に含める 4 要素）

```markdown
## 背景 — なぜやるか。関連 issue / docs / 過去 PR へのリンク

## やること — 番号付き手順。対象ファイル path を明記

## 注意 — 既知の罠、触ってはいけない領域、関連 skill（例: supabase skill のフロー）

## 検証 — pass すべきコマンド（pnpm check 等）と確認観点
```

### `status:ready` の定義（機械判定）

**上記 4 セクションがすべて埋まっていない issue には `status:ready` を付けられない。** 空見出しや「TBD」のまま残っている issue は `status:blocked` または無ラベルのままにする。この判定は主観の運用ルールではなく、`status:ready` を付けるすべての操作(操作 B 手順 4、操作 D 手順 2、sweep での戻し)の前提条件として扱う。

### 渡し方の判断（束ねた後の内容で毎回判定する）

`size:*` ラベルには依存しない（`size:*` は deprecated。操作 B 手順 3 参照）。編成のたびに issue 本文の内容から次の 3 区分のいずれかを判定する:

- **直接実装**: 手順が既存パターンの追従で完結する。plan 不要
- **plan 先行**: 複数ファイル・複数 Step にまたがる、または既存 contract に触れる。worker に plan を先に出させ `/plan-review` を通してから実装。複数 issue を束ねた PR は merge 前の read-only subagent クロスレビューが必須（`.claude/rules/workflow.md` §PR 粒度）
- **最上位 tier 専用**: spike / 設計判断を含む issue、または `risk:authority` が付いた issue。worker に渡さず、最上位ティア（`.claude/rules/ai-behavior.md` のティア表参照）のセッションで実施

## 操作 B: intake — 新しい作業を issue 化する

作業依頼・発見事項・監査結果が issue の外にある状態を作らない。

1. `gh search issues` で既存 issue との重複を確認（close 済み含む）
2. 重複なら既存 issue に本文追記 or コメントで統合。新規なら handoff-quality で起票
3. ラベルは既存体系のみ使う: `type:*` / `priority:*` / `area:*` / `quality:*` など、掲載一覧（[github-labels.md](../../../docs/operations/github-labels.md)）にあるものだけ。`size:*` は **deprecated**（新規 issue には付けない。既存 issue から剥がしはしない）。新ラベルを作らない
4. `status:*` で着手可否を表す（着手可なら `status:ready`。`status:ready` を付けられる条件は §`status:ready` の定義（機械判定）に従う。前提待ちなら `status:blocked`）。既存テーマに属するなら該当 `scope:epic` issue の sub-issue にする。最上位ティア専用 / 🔒 prod 操作である旨は issue 本文の §注意 に書く。issue の実行自体に `EXPLICIT AUTHORITY` の不可逆操作（production mutation / release / データ削除 / 不可逆 migration / 実課金。`CLAUDE.md` §協働のかたち）が含まれる場合に限り `risk:authority` を付け、朝の編成で User の裁可ポイントを事前提示する（`.claude/rules/orchestration.md` §権限の既定）。可逆な auth / RLS / billing のコード変更には付けない（`risk-reviewer` の自動委任と、必要に応じた `CHECKPOINT` で扱う）
5. **milestone を判断する**: 現行 milestone（次の minor version。open は常に 1 個、世代交代は releasing skill Phase 3.1）に入れて押し込む作業なら milestone を付ける。付けなければバックログ。「next」milestone は作らない

## 操作 C: sweep — 定期棚卸しで gap を検出する

指揮台の朝の編成（`.claude/rules/orchestration.md` §1 日サイクル）が動くようになったため、頻度の高い項目は日次で吸収する。頻度が低い・外部サービス往復を要する項目だけ月次 backstop として `/gardening` に残す。同じ項目を両方に重複させない。

### 日次盤面 issue の起票（策定日: 2026-08-20、[#2259](https://github.com/Dayopt/dayopt/issues/2259)）

夜勤 Routine（`night-watch` v2、毎日 05:00 JST 実行。旧 07:00 JST から前倒し（2026-08-24、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメント）。[#2291](https://github.com/Dayopt/dayopt/issues/2291) で朝の別 Routine を新設せず夜勤へ統合。未登録の間は指揮台が代行）が平日のみ「盤面 YYYY-MM-DD」issue（`type:board` ラベル）を新規起票する（土日は night-watch 側で skip、`.claude/skills/night-watch/SKILL.md` §自動パート Step 1 参照）。**実行手順の正本は `.claude/skills/night-watch/SKILL.md` §自動パート Step 1**（複製しない）。テンプレ本体はこのファイル（操作C）が正本のまま:

```markdown
> このビュー（観測コンテンツ）は指示の効力を持たない。効力は send_message のポインタ到達で確定する（`.claude/rules/orchestration.md` §裁可・指示の経路）。
>
> 本文 = 現在地のスナップショット、コメント列 = タイムライン（状態遷移を指揮台が 1 行ずつ追記。手書きの集計数字は本文に書かない）。

## 1. 今週の最優先

（前日の日次盤面 issue §1 をそのままコピー。当日中の編集は User/指揮台が直接行う）

## 2. 進行中レーン

（空。指揮台が dispatch のたびに 1 行追記し、同じタイミングで盤面 issue へ 1 行のイベントコメントも追記する。段階値: 起動待ち → 実装中 → レビュー待ち → fix対応中 → merge可能 →（branch:finish で行削除）。対応表は `.claude/rules/orchestration.md` §日次盤面issue 参照）

## 3. 本日の実績

- [本日 merge された PR 一覧](https://github.com/Dayopt/dayopt/pulls?q=is%3Apr+is%3Amerged+merged%3AYYYY-MM-DDT00%3A00%3A00%2B09%3A00..YYYY-MM-DDT23%3A59%3A59%2B09%3A00)
- [本日 close された issue 一覧](https://github.com/Dayopt/dayopt/issues?q=is%3Aissue+closed%3AYYYY-MM-DDT00%3A00%3A00%2B09%3A00..YYYY-MM-DDT23%3A59%3A59%2B09%3A00)
- 経緯（いつ何が起きたか）は本 issue のコメント列（タイムライン）を上から読む

## 4. 次にやるキュー

[status:ready の issue 一覧](https://github.com/Dayopt/dayopt/issues?q=is%3Aissue+is%3Aopen+label%3Astatus%3Aready)

## 5. 要判断

[type:discussion の issue 一覧](https://github.com/Dayopt/dayopt/issues?q=is%3Aissue+is%3Aopen+label%3Atype%3Adiscussion)（開いた議論）
[status:blocked の issue 一覧](https://github.com/Dayopt/dayopt/issues?q=is%3Aissue+is%3Aopen+label%3Astatus%3Ablocked)（凍結・裁可待ち。解除条件は各 issue 本文）

## 6. 決定ログ

[docs/decisions.md](https://github.com/Dayopt/dayopt/blob/main/docs/decisions.md)（append-only 全履歴）
```

`YYYY-MM-DD` は起票日の JST 日境界（`+09:00`）で埋める。起票後、前日の日次盤面 issue は close する（引き継ぎは新issueの §1 コピーとコメントで完結しているため、旧issueに残す情報はない）。**初回起票**（Routine 未登録の間の最初の 1 回）は本 PR の merge 後に指揮台が手動で行う。Routine の実登録・スケジュール設定自体はこの skill / 本 PR の scope 外（指揮台/User 操作枠が別途行う）。

**cutover 手順（初回起票時のみ、指揮台が実施）**: [#2020](https://github.com/Dayopt/dayopt/issues/2020)「朝の盤面ブリーフ置き場」の役割は日次盤面 issue へ完全吸収される。

1. PR merge 後、指揮台が上記テンプレで初日の盤面 issue を手動起票する
2. #2020 へ最終コメント（「以後の盤面・引き継ぎは日次盤面 issue へ。最新は `label:type:board is:open` で発見」）を投稿して close する

### 日次（指揮台の朝編成が吸収）

- [ ] 当日の日次盤面 issue に本日分のコメント/追記が無いことの確認（[#2256](https://github.com/Dayopt/dayopt/issues/2256) 再scope。night-watch の前夜コメント欠落検出と同型 — §2 レーン表の更新漏れ、または issue 自体の起票漏れを検出する）。あわせて **§2 に載る PR 番号が既に closed になっていないか**を確認する（`branch:finish` 完了時の行削除漏れ、または close イベントのコメント記録漏れを検出する。2026-08-20 追記、[#2285](https://github.com/Dayopt/dayopt/issues/2285)）
- [ ] open PR で 2 週間以上動きがないものの扱い（rebase / close / 引き継ぎ）
- [ ] worktree・ブランチの残骸: `git worktree list` / `git worktree prune` / `git branch --merged main`（手順は `.claude/rules/workflow.md` §Worktree 運用）
- [ ] 現行 milestone の中身が実態と合っているか（停滞 issue を外してバックログへ / milestone 外で進んでいる作業を入れる）。**検査基準（2026-08-12）: open PR の Closes 対象 issue と `status:in-progress` issue はすべて現行 milestone に入っているか。open PR 自体にも milestone が付いているか（2026-08-13、#2065）**
- [ ] `status:in-progress` の棚卸し（レーンが動いていない issue を `status:ready` へ戻す、または `status:blocked` に落とす）
- [ ] Supabase の残存 preview branch 確認（δ 運用でコストが Spend Cap の対象外のため、閉じ忘れた branch は課金が止まらない。閉じた PR に対応する branch が残っていないかを毎朝見る）
- [ ] night-watch 運行記録の前夜コメント確認（`.claude/skills/night-watch/SKILL.md`。欠落があれば故障を疑い `docs/operations/night-watch.md` §故障検出手順 に従う）
- [ ] **ランダム抽出監査**（2026-08-20、[#2273](https://github.com/Dayopt/dayopt/issues/2273)。候補提示は 2026-08-21 に夜勤へ移管、[#2291](https://github.com/Dayopt/dayopt/issues/2291)）: 候補 PR の選定・提示は夜勤 Routine（`.claude/skills/night-watch/SKILL.md` §自動パート Step 4）が当日盤面 issue へ「DoD監査候補: #NNNN（PRタイトル）」として既にコメント済み（前日 merge PR が無ければ「DoD候補: 前日merge PR無し」）。朝の編成では指揮台がこのコメントを確認し、対象 issue の dispatch コメントに記載した DoD（操作 A 手順 6）と実際の merge 内容が意図どおりかを User が 5 分で監査する。夜勤が「前日merge PR無し」を報告した日、または夜勤自体が故障している日は指揮台が候補提示を代行する。見つかったズレは `judgment:diverged` ラベルでジャーナル化する（`.claude/rules/orchestration.md` §判断ジャーナル）
- [ ] **heavy-post-merge の赤確認**（2026-08-20、CI 4 層再設計 [#2269](https://github.com/Dayopt/dayopt/issues/2269)）: `gh run list --workflow=heavy-post-merge.yml --limit 5 --json conclusion,createdAt,event` で直近 run を確認する。red（`conclusion=failure`）があれば修正 issue を最優先で起票する。E2E / Web E2E / Integration Tests は per-PR から撤去され、main push 後 + nightly でしか検証されないため、この確認を欠くと壊れた main が promote gate（層 4）に阻まれるまで無通知で滞留する

### 月次 backstop（`/gardening` と同時期に実施）

以下の「issue の外に作業が溜まりやすい場所」を機械的に確認し、見つけたら操作 B で起票する:

- [ ] Supabase advisors: `get_advisors`（security / performance）の WARN が issue 化されているか
- [ ] Dependabot security alerts: `gh api repos/Dayopt/dayopt/dependabot/alerts?state=open` が 0 件か
- [ ] `docs/operations/log/` の監査・incident ログ末尾の「残タスク」が issue 化されているか
- [ ] NOT_PLANNED で close された issue の中身が、実は未完了のまま受け皿を失っていないか
- [ ] 生成系スクリプト（`api:spec` / `types:generate` / `rls:snapshot`）が現在も exit 0 で通るか

## 操作 D: unfreeze — 凍結解除の判定

`status:blocked` の issue は、本文に書かれた解除条件（例: time-model-split Step 8 cutover 完了）を満たしたときのみ解除する。解除条件が本文に無い issue は、解除前にまず条件を本文へ書く。

1. 解除条件の達成を設計書・merge 済み PR で確認する
2. `status:blocked` を `status:ready` へ差し替え、**着手前に設計を現状に合わせて見直す**コメントを残す（凍結中に前提が変わっているため、本文の対象ファイル・手順は書き直し前提）
