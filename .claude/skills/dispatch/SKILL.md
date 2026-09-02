---
name: dispatch
description: GitHub issue を worker（Sonnet などの委譲先モデル）へ渡す準備をする時、非 feature 作業の issue を新規起票する時、epic の sub-issue 構成や `status:*` ラベルを更新する時、`status:blocked` の凍結 issue への着手が話題になった時、並行作業の定期棚卸し（sweep）や凍結解除を行う時に発動。凍結・衝突チェック、handoff-quality 補強、既存ラベル体系を適用する。issue の中身の実装作業そのものや、意思決定ログ作成（`decision` skill の領域）では発動しない。
---

# Dispatch Skill

feature 開発と並行する非 feature 作業を issue ベースで回す指揮者（conductor）の定常運用。**どのモデル（Opus / Sonnet / それ以降）でも実行できる**ことを前提に、判断基準をすべて本ファイルに明文化する。個人メモリや特定モデルの記憶に依存しない。

**正（source of truth）**: 状態は **GitHub issue 自身**が持つ。open / closed に加えて `status:ready` / `status:in-progress` / `status:review` / `status:blocked` / `status:watching` のラベルが着手可否を表し、大きなテーマは `scope:epic` の issue が sub-issues で束ねる。全体俯瞰は rollup issue を読むのではなく、`scope:epic` 一覧 + `status:*` クエリで都度組み立てる。

**rollup tracking issue は廃止した**（2026-08-01、#1788 を close。経緯は 2026-08-01-issue-state-labels-epics.md（削除済み、git 履歴参照））。後継 rollup は作らない。本ファイルは「手順」、issue とラベルが「状態」。

**履歴もコメントに落とす。** dispatch の記録（操作 A 手順 6）に加えて、checkpoint report、判断分岐（推奨と実際の判断が分かれた時は、該当 issue へ分岐コメント + `docs/decisions.md` へ1行、の形で残す。旧 `judgment:diverged` ラベル運用と月次同期の機構は廃止済み）、レーンからの完了報告も、該当 issue のコメントとして残す。セッションは transcript に状態を持たないため、issue コメントが唯一の永続履歴になる。

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
- 意思決定ログの作成（`decision` skill の領域）
- feature 実装 plan の策定（`AGENTS.md` §実装 Plan の必須セクション に従う。dispatch は「誰に渡すか」だけを扱う）

## 操作 A: dispatch — issue を worker に渡す

1. `gh issue list --milestone <現行milestone> --label status:ready --state open` で候補を選ぶ（ユーザー指定があればそれを優先）。milestone 内が空なら `--label status:ready --state open` 全体から。テーマ単位で見たい場合は該当 `scope:epic` issue の sub-issues から絞る。**`gh issue list` は既定で open のみ返すためこの経路では実害が薄いが、epic issue のコメント経由・issue 番号の直指定など一覧以外の経路で候補を得た場合はこの既定に頼れない。** リスト以外の経路で得た候補ほど、次の state 確認（手順 4）を必ず通す
2. **束ね**: 関連する issue（同一 area / 同一機能系統）は 1 worker セッション・1 branch・1 PR にまとめて渡すのを標準とする（`AGENTS.md` §PR / git 運用）。1 issue ずつ切り出さない
3. **衝突チェック**: 候補 issue が触るファイル・ディレクトリを、(a) 進行中 epic issue 本文（例: #1754 の該当 Step）の対象、(b) 他の in-progress issue（`status:in-progress` ラベル）の対象、と突合する。**重なる場合は同一 worker に束ねて直列で処理するのを第一候補**とする（並行させない理由が衝突回避なら、束ねる方が安全かつ安価）。束ねられない場合だけ次の候補へ
4. **凍結・state チェック**: `status:blocked` が付いていないこと、かつ候補 issue の `state` が OPEN であることを確認する。state は `gh issue view <N> --json state` の実測を根拠にする（close 済み issue にも `status:ready` 等のラベルが残留しうるため、**ラベルは state の代わりにならない**）。束ねた場合は全 issue について両方確認する。1 つでも凍結 or close 済みなら、その issue だけ束ねから外す（2026-08-12、close 済み #1895 への誤 dispatch を受けて state 確認を追加。経緯は #1957）
5. issue 本文を **handoff-quality** に補強する（下記テンプレート）。worker が repo 探索なしで着手できる密度が基準
6. **実装前 Codex Issue Review の gate**（#2530）: 束ねる全 issue について `pnpm review:issue:gate <N>` を実行する。exit 0 なら次へ。**exit 1 の issue は `status:in-progress` へ進めない**（散文の規約ではなく機械判定。gate は `review:full` ラベルが無い issue には何も要求しないので、低リスク issue のテンポは変わらない）

   `review:full` issue で gate が止まった時の是正フロー:

   1. issue へ定型メンションを投稿し、Codex の返信を待つ:

      ```
      @codex このIssueを実装前レビューしてください。問題設定、前提、設計、scope、rollback、verification を反証し、実装前に修正すべき問題があれば指摘してください。コード変更はしないでください。
      ```

   2. P1/P2 が出たら **実装前に**解決する。手段は 3 つ: 本文を修正する（fingerprint が変わるので再メンションが要る） / 反論の根拠を issue コメントへ残す / scope を分割する。**未解決のまま着手しない**
   3. `pnpm review:issue:marker <N> --p1 <件数> --p2 <件数> [--resolution-note "..."]` で marker を生成し、内容を目視してから `gh issue comment` で投稿する。fingerprint は script が現在の issue 内容から実測するので手書きしない（`--fingerprint` は受け付けない）。P1/P2 が非ゼロの marker は `--resolution-note` が無いと `status: findings` になり gate を通らない
   4. `pnpm review:issue:gate <N>` を再実行して pass を確認する

   gate は「Codex bot のコメントが実在すること」と「marker の fingerprint が現在の issue 内容と一致すること」の AND で判定する。前者がレビュー実施の証明、後者がレビュー対象が現在の本文である証明で、片方だけでは通らない。**`review:full` を外しても降格しない** — ラベルの削除履歴があるか、この issue 宛ての marker が既にある issue は、current な pass 証跡が出るまで gate 対象に残る（失敗したレビューをラベル削除で迂回する経路を塞ぐため、#2530 実装前レビュー P2）。merge 時も同じ判定が linked issue すべてに対して走る。

   `review:full` issue を実装する PR は、PR 側でも自動的にクロスレビュー必須になる（`Closes #N` の linked issue から継承。`Refs #N` は継承しない、#2530）。束ねた issue はすべて `Closes #N` で列挙する。

7. `status:ready` を `status:in-progress` へ差し替え、**その issue 自身**にコメントで dispatch 先（Sonnet / その他）を記録する。束ねた場合は代表 issue にコメントし、他は代表へリンクする。**この着手のタイミング（レーンへの割り当て、または PR の Closes に載せた時点）で、対象 issue に現行 milestone を付与する**（2026-08-12。編成時（操作 B 手順 5）の「押し込むか」の判断とは独立に、着手 = 付与を機械的に行う。経緯は #2006）。**レーンが draft PR を作成した時点で、PR 自身にも現行 milestone を付与する**（2026-08-13。issue 側だけでなく PR 側にも milestone が付いていると、release notes 作成時の merged PR 集計と全体の把握が楽になる。経緯は #2065）。**この dispatch コメントに DoD（完了の定義）を 1〜3 行で記載する**（2026-08-20、[#2273](https://github.com/Dayopt/dayopt/issues/2273)。「仕様には適合しているが意図とズレている」静かな失敗は着手時点の意図と突き合わせないと見つからない。merge 内容がその意図どおりかを後から確認できるよう、issue コメントに固定しておく。束ねた場合は代表 issue のコメントへ一括で書く。突き合わせは PR レビュー時と、ズレを疑った時に行う）
8. worker への指示は issue URL + 「本文の受け入れ条件と検証コマンドに従う」だけで済む状態にする。着手手順・PR 規約・報告テンプレート・検証原則はチップ prompt へ個別に書き下さず `AGENTS.md` §レーン運用 への参照 1 行で足りる

### handoff-quality テンプレート（issue 本文に含める 4 要素 + 任意 1 要素）

```markdown
## 背景 — なぜやるか。関連 issue / docs / 過去 PR へのリンク

## やること — 番号付き手順。対象ファイル path を明記

## 注意 — 既知の罠、触ってはいけない領域、関連 skill（例: supabase skill のフロー）

## 検証 — pass すべきコマンド（pnpm check 等）と確認観点

## 期待出力（該当時のみ）— 返してほしい形式。分類軸、判断ごとの証拠水準、撤退・rollback 条件の明示要求
```

**「## やること」で原因・機構に触れる記述には証拠水準ラベルを必須にする**（2026-08-27、[#2428](https://github.com/Dayopt/dayopt/issues/2428)）。「なぜそうなるか」「どう直るか」の記述は、`推定（未実測、issue本文由来）` か `実測（コマンドと出力を併記）` のどちらかを明記する。「## やること」は番号付き手順という命令形の書式のため、指揮台が未実測の推定をそのまま手順として書く誘導が構造的にある（#2417 / #2419 で、指揮台の推定をレーンの実測が覆した実例がある）。ラベルがあれば、レーンは §着手手順 の復唱で「推定」箇所だけを狙って着手前に実測できる。**ラベルを付けさえすれば推定を書いてよい、という逃げ道にしない** — 実測できる推定は起票前に実測してから書く。実測コストが高い（外部サービス往復・本番環境限定等）場合に限って `推定（未実測、issue本文由来）` を使う

**「## 期待出力」はレビュー / 調査 / spike 系の issue でだけ書く**（2026-08-31、[#2468](https://github.com/Dayopt/dayopt/issues/2468)）。`type:spike`・反証レビュー依頼・監査系のように成果物がコードではなく判断である issue は、出力形式が受け手任せだと要約の粒度と証拠水準がぶれる。依頼側が先に契約（分類軸、判断ごとの repo 証拠、最小差分、rollback・撤退条件、「やらない方がいい改善」の明示など）を固定すると往復が減る（実測: [#2453](https://github.com/Dayopt/dayopt/issues/2453) の反証レビュー依頼は 4 分類 + 証拠要求を先に固定し、1 発で採否判断に使える出力が返って往復ゼロで裁可に至った）。**実装系 issue では省略する** — 「## 検証」が出力契約を兼ねるため、埋めても空欄か形式的コピペになる。

### `status:ready` の定義（機械判定）

**上記テンプレートの必須 4 セクション（背景 / やること / 注意 / 検証）がすべて埋まっていない issue には `status:ready` を付けられない。**（「## 期待出力」は optional なので判定条件に入らない。） 空見出しや「TBD」のまま残っている issue は `status:blocked` または無ラベルのままにする。この判定は主観の運用ルールではなく、`status:ready` を付けるすべての操作(操作 B 手順 4、操作 D 手順 2、sweep での戻し)の前提条件として扱う。

### 渡し方の判断（束ねた後の内容で毎回判定する）

`size:*` ラベルには依存しない（`size:*` は deprecated。操作 B 手順 3 参照）。編成のたびに issue 本文の内容から次の 3 区分のいずれかを判定する:

- **直接実装**: 手順が既存パターンの追従で完結する。plan 不要
- **plan 先行**: 複数ファイル・複数 Step にまたがる、または既存 contract に触れる。worker に `AGENTS.md` §実装 Plan の必須セクション に従った plan を先に出させてから実装。複数 issue を束ねた PR は merge 前の `pr-cross-review` skill によるクロスレビューが必須
- **最上位 tier 専用**: spike / 設計判断を含む issue、または `risk:authority` が付いた issue。worker に渡さず、最上位ティア（`AGENTS.md` §委任・報告の作法 のモデル tier 表参照）のセッションで実施

## 操作 B: intake — 新しい作業を issue 化する

作業依頼・発見事項・監査結果が issue の外にある状態を作らない。

1. `gh search issues` で既存 issue との重複を確認（close 済み含む）
2. 重複なら既存 issue に本文追記 or コメントで統合。新規なら handoff-quality で起票。**RLS ポリシー・テナント境界・スキーマ変更に関わる起票では、ここで Codex（読み取り専用の別系統批評係）に攻撃シナリオ生成を実行させ、出力を「## テストすべき攻撃シナリオ」として本文に貼る**:

   ```bash
   codex exec --sandbox read-only \
     "supabase/migrations/ 配下のスキーマと RLS ポリシーを読み、
      テナント越えの読み書きができてしまう可能性のあるクエリ・操作パターンを
      10個列挙せよ。それぞれ悪用手順を1行で添えること。"
   ```

   出力をチケット本文に貼る。テストの実装は通常の worker レーンが行う（Codex にコードは書かせない）。呼び出し失敗・タイムアウト時はスキップして本来のフローを続行する（best-effort）

   **これは起票時の攻撃シナリオ生成であり、操作 A 手順 6 の実装前 Codex Issue Review（`review:full` issue で必須・fail closed）とは別物。** 前者は本文を厚くするための best-effort な補助、後者は着手可否を決める機械 gate で、経路（CLI / GitHub メンション）も証跡の要否も違う

3. ラベルは既存体系のみ使う: `type:*` / `priority:*` / `area:*` / `quality:*` など、掲載一覧（[github-labels.md](../../../docs/operations/github-labels.md)）にあるものだけ。`size:*` は **deprecated**（新規 issue には付けない。既存 issue から剥がしはしない）。新ラベルを作らない
4. `status:*` で着手可否を表す（着手可なら `status:ready`。`status:ready` を付けられる条件は §`status:ready` の定義（機械判定）に従う。前提待ちなら `status:blocked`）。既存テーマに属するなら該当 `scope:epic` issue の sub-issue にする。最上位ティア専用 / 🔒 prod 操作である旨は issue 本文の §注意 に書く。issue の実行自体に `EXPLICIT AUTHORITY` の不可逆操作（production mutation / release / データ削除 / 不可逆 migration / 実課金。`AGENTS.md` の authority level 定義）が含まれる場合に限り `risk:authority` を付け、実行前に User の明示指示を得る。可逆な auth / RLS / billing のコード変更には付けない（`pr-cross-review` skill での確認と、必要に応じた `CHECKPOINT` で扱う）
5. **milestone を判断する**: 現行 milestone（次の minor version。open は常に 1 個、世代交代は releasing skill Phase 3.1）に入れて押し込む作業なら milestone を付ける。付けなければバックログ。「next」milestone は作らない

## 操作 C: sweep — 定期棚卸しで gap を検出する

指揮台の朝の編成が動くようになったため、頻度の高い項目は日次で吸収する。頻度が低い・外部サービス往復を要する項目だけ月次 backstop として `/gardening` に残す。同じ項目を両方に重複させない。

### 日次盤面 issue は廃止（2026-09-01、[#2525](https://github.com/Dayopt/dayopt/issues/2525)）

**レーンの進行状況は、各 issue / PR 自身のコメントが正本**（このファイル冒頭の「正（source of truth）」と同じ原則。盤面はその写しに過ぎず、二重管理と更新漏れの温床だった）。俯瞰が要る時は都度クエリで組み立てる:

- ready キュー: `gh issue list --state open --label status:ready`
- 走行中レーン: `gh issue list --state open --label status:in-progress` と `gh pr list --state open`
- 要判断: `gh issue list --state open --label type:discussion` / `--label status:blocked`
- 本日の実績: `gh pr list --state merged --search "merged:>=<YYYY-MM-DD>"`

### 日次（指揮台の朝編成が吸収）

- [ ] open PR で 2 週間以上動きがないものの扱い（rebase / close / 引き継ぎ）
- [ ] worktree・ブランチの残骸: `git worktree list` / `git worktree prune` / `git branch --merged main`（手順は `AGENTS.md` §PR / git 運用）
- [ ] 現行 milestone の中身が実態と合っているか（停滞 issue を外してバックログへ / milestone 外で進んでいる作業を入れる）。**検査基準（2026-08-12）: open PR の Closes 対象 issue と `status:in-progress` issue はすべて現行 milestone に入っているか。open PR 自体にも milestone が付いているか（2026-08-13、#2065）**
- [ ] `status:in-progress` の棚卸し（レーンが動いていない issue を `status:ready` へ戻す、または `status:blocked` に落とす）
- [ ] Supabase の残存 preview branch 確認（δ 運用でコストが Spend Cap の対象外のため、閉じ忘れた branch は課金が止まらない。閉じた PR に対応する branch が残っていないかを毎朝見る）
- [ ] **heavy-post-merge の赤確認**（2026-08-20、CI 4 層再設計 [#2269](https://github.com/Dayopt/dayopt/issues/2269)。2026-08-25、[#2382](https://github.com/Dayopt/dayopt/issues/2382) で per-merge 実行を廃止。2026-08-28、[#2483](https://github.com/Dayopt/dayopt/issues/2483) で heavy-post-merge.yml / integration.yml が nightly.yml へ統合され job-scoped 判定へ移行）: `gh run list --repo Dayopt/dayopt --workflow nightly.yml --branch main --limit 3 --json databaseId,status,conclusion,createdAt` で直近 run を取り、`gh api repos/Dayopt/dayopt/actions/runs/<id>/jobs --jq '.jobs[] | select(.name == "🎭 E2E Tests" or .name == "🌐 Web Build & E2E" or .name == "Integration Tests") | {name, status, conclusion, html_url}'` で job 単位の結論を確認する（promote.yml の層 3 gate と同じ check-run 名）。`conclusion: failure` があれば修正 issue を最優先で起票する（`html_url` が該当 job のログ URL）。E2E / Web E2E / Integration Tests は per-PR から撤去され、nightly + 手動発火でしか検証されないため、この確認を欠くと壊れた main が promote gate（層 4）に阻まれるまで無通知で滞留する。**`status` が `in_progress` / `queued` の場合は完了を待って再確認する**（per-merge 廃止で「日中の main push run が backstop になる」前提が消えたため、nightly の遅延をそのまま見ると赤確認が空振りする）

### 月次 backstop（`/gardening` と同時期に実施）

以下の「issue の外に作業が溜まりやすい場所」を機械的に確認し、見つけたら操作 B で起票する:

- [ ] Supabase advisors: `get_advisors`（security / performance）の WARN が issue 化されているか
- [ ] Dependabot security alerts: `gh api repos/Dayopt/dayopt/dependabot/alerts?state=open` が 0 件か
- [ ] NOT_PLANNED で close された issue の中身が、実は未完了のまま受け皿を失っていないか
- [ ] 生成系スクリプト（`api:spec` / `types:generate` / `rls:snapshot`）が現在も exit 0 で通るか

## 操作 D: unfreeze — 凍結解除の判定

`status:blocked` の issue は、本文に書かれた解除条件（例: time-model-split Step 8 cutover 完了）を満たしたときのみ解除する。解除条件が本文に無い issue は、解除前にまず条件を本文へ書く。

1. 解除条件の達成を設計書・merge 済み PR で確認する
2. `status:blocked` を `status:ready` へ差し替え、**着手前に設計を現状に合わせて見直す**コメントを残す（凍結中に前提が変わっているため、本文の対象ファイル・手順は書き直し前提）
