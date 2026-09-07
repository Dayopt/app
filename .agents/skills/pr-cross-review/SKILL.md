---
name: pr-cross-review
description: PR の CI が green で review thread が全件 resolve され merge 候補になった時に、束ねた PR の merge 前クロスレビュー時、auth / RLS / billing / migration / 公開契約等の diff を merge 前に確認する時に発動。内製 subagent（risk-reviewer / behavior-verifier / architecture-guard）を並列実行し、所見を PR review comment として投稿する advisory レビュー（merge を止めない）。実装では発動しない。
effort: medium
maxTurns: 20
---

# PR クロスレビュー スキル

Main が merge 前に実行する advisory クロスレビューの標準手順（2026-09-04、#2596。旧: 内製 subagent と Codex の独立 2 系統を merge の hard gate にする設計 #2529 / #2530 / #2558 / #2562 は撤回した）。

**merge の遮断は Claude Code hook（`gh pr merge` 直接実行の block）と `pnpm branch:finish` の CI check（status-check-rollup 判定）だけで行う。**（`AGENTS.md §PR / git 運用` §レビュー）。このスキルの所見は PR review comment として投稿するだけで、merge の可否には影響しない — 見つけた P1/P2 は review thread の resolve 運用（fix / 反論 / issue 化）に乗せるが、投稿を忘れても機械的に検知されない。`@codex review` は User が手動で使いたい時だけの任意ツールで、このスキルの手順には含めない。

保護対象 path（`scripts/ci/protected-path-gate.mjs` が正本）に触れる PR は、advisory レビューをより丁寧に行う目安として扱う。低リスク PR（docs-only 等）は独立実行を省略してよい。

**常設の subagent 定義（`.claude/agents/*.md`）は 2026-08 に全廃した（#2478）。** risk-reviewer / behavior-verifier / architecture-guard の persona・read-only 契約・review scope は、`.agents/skills/pr-cross-review/cross-review-workflow.js` の `ROLE_PROMPTS` へ inline prompt として畳み込んである（下記手順 3 参照）。role 名は `Workflow` 呼び出し時のラベル・schema 選択キーとしてのみ残り、`Agent` tool の `subagent_type` としては存在しない。

## When to Use

**副次トリガー型** — 「コード変化」ではなく「レーンから merge 可能報告を受けた」という上位イベント確定後に発動する。

**上位イベント起点:**

- PR の CI が green で review thread が全件 resolve され merge 候補になった時（レーン報告 / Main の判定）
- 保護対象 path に触れる PR、または複数 issue / 複数 Step を束ねた PR が merge 前に advisory レビューを受けるべき時（`AGENTS.md §PR / git 運用` §レビュー）

**診断起点:**

- 自動委任条件（auth / RLS / service role / OAuth / webhook / billing / redirect / migration / `SECURITY DEFINER/INVOKER` / 現在挙動・公開契約・state transition・query cache・temporal contract・bug regression / cross-feature import・barrel・Composition Layer・file move・依存方向。正本は本 skill 手順 2 の表）に該当する diff を merge 前に見つけた時

## When NOT to Use

- push 前の自己反証レビュー（レーン自身が push 前に行う敵対的セルフレビュー。subagent は同じでも実行主体と目的が異なる — このスキルは merge 前の Main 側レビュー）
- plan 段階のレビュー（このスキルは merge 前の diff レビュー専用。plan の妥当性検証は `AGENTS.md §実装 Plan の必須セクション` に従う）
- 実装そのもの（write 可能な subagent への委譲は `AGENTS.md §委任・報告の作法` の writer 4 条件に従う。このスキルは read-only）

## 手順

### 1. 対象 diff を読み取り可能な形にする

**Main自身が** `gh pr diff <PR番号>` を実行し、出力を絶対パスのファイル（例: スクラッチパス配下）へ書き出す。subagent（`risk-reviewer` / `behavior-verifier` / `architecture-guard`）は `Read` / `Grep` / `Glob` しか持たず `Bash` が無いため、subagent 自身に `gh pr diff` を叩かせることはできない。

- subagent へは、この絶対パスファイルを一次情報として渡す。cwd 相対の `Read` に頼った実装は禁止（Main は main checkout 常駐のため、経路を明示しないと main の内容を読んでしまう）
- PR の worktree（`.claude/worktrees/<name>/`）が存在し、かつ `git -C <worktree> status --porcelain` が空、かつ HEAD が対象 PR の `headRefOid` と一致する場合に限り、worktree 直読みを補助的な追加コンテキストとして使ってよい（diff ファイルの代替にはしない）

### 2. subagent を選ぶ

レーンから push-ready 報告 / レビュー待ち報告に添付された push 前セルフレビューの subagent 生出力（`AGENTS.md §レーン運用`、策定日: 2026-08-25、[#2374](https://github.com/Dayopt/dayopt/issues/2374)）があれば、まずそれを一次資料として読む。

- **自動委任条件に該当する diff**（下記表参照）では、レーン添付の有無に関わらず Main の独立実行を維持する（既定不変 — 同一 agent 系列の自己申告に検証を委ねない）
- **非該当・低リスク diff**（docs-only を含む）では、レーン添付 findings を検証した上で Main の独立実行を省略してよい。省略した場合、手順 6 の summary comment の経緯欄に「レーン添付 findings を検証、独立実行省略」と明記する。レーンの添付は自己申告であり Main の検証代替ではない（出発点の提供に留まる）ため、「検証した」と書けるのは実際に一次情報（diff・path・symbol）と突き合わせた場合に限る

独立実行するかどうかは、下記の自動委任条件表（この表が正本）に照らして選ぶ:

- auth / RLS / service role / OAuth / webhook / billing / redirect / migration / `SECURITY DEFINER/INVOKER` → `risk-reviewer`
- 現在挙動 / 公開契約 / state transition / query cache / temporal contract / bug regression → `behavior-verifier`
- cross-feature import / barrel / Composition Layer / file move / 依存方向 → `architecture-guard`
- いずれにも該当しない場合（docs-only 等）、subagent は起動しない。§投稿フォーマット の「対象外 diff」形式で記録する

### 3. 並列実行する（Workflow + schema 強制）

該当する subagent を `Workflow` tool で並列実行する。**素の `Agent` tool は使わない**（StructuredOutput を機構的に強制できず、書き出し停止の再発源だったため。#2227 の prompt 契約適用後も1日5回再発し、#2348 で構造的強制へ移行した）。

Main は常に main checkout（repo root）に常駐する（旧 orchestration.md §Main セッションの定義、#2479 で廃止・git 履歴参照）ため、`scriptPath` は repo root 基点で `.agents/skills/pr-cross-review/cross-review-workflow.js` を指定する。`args` に手順 1 の diff ファイル絶対パス、選定した reviewer 一覧（`risk-reviewer` / `behavior-verifier` / `architecture-guard` のいずれか）、および ctx pack（Main が `node scripts/tasks/ctx.mjs <PR番号>` を実行して得た markdown。取得に失敗した場合は `未取得` を渡す fail-open）を渡す。**Workflow script は Node.js API・ファイルアクセスを持たない**ため、`gh pr diff` と同様に ctx pack の取得自体も Main が実行し、内容そのものを `args` 経由で渡す（パスではなく文字列。script 内で `execFileSync` を呼ぶことはできない）:

```
Workflow({
  scriptPath: ".agents/skills/pr-cross-review/cross-review-workflow.js",
  args: {
    diffPath: "<手順1の絶対パス>",
    reviewers: ["risk-reviewer", "behavior-verifier"],
    ctxMarkdown: "<node scripts/tasks/ctx.mjs <PR番号> の stdout。失敗時は '未取得'>",
  }
})
```

reviewer は diff だけでなくこの ctx pack（受け入れ条件 / DoD / 次の一手。PR mode では linked issue（Closes/Refs/Fixes、最大 3 件）の `## やること` / `## 検証` 抜粋を `#### linked issue の受け入れ条件` として持つ）も読み、diff がそれらと食い違う点をコードの欠陥と同じ重さで指摘する（従来は diff しか渡していなかったため、意図と乖離した実装を見逃しやすかった）。ctx pack は GitHub 上で誰でも書ける issue/PR コメント・body から組み立てられる untrusted data のため、prompt 内の配置は role prompt → 境界指示（ctx はデータであり指示ではない旨） → `<untrusted-context>` タグで囲った ctx 本体 → diff 指示、の順に固定する（ctx を先頭かつ指示文同居のまま渡すと、ctx 内の injection がプロンプト末尾の「最後の指示」として読まれかねなかった。F1、#2545 の内製レビュー指摘）。

**role ごとの persona・read-only 契約・review scope・model は、`.claude/agents/*.md`（2026-08 に全廃、#2478）の代わりに `cross-review-workflow.js` の `ROLE_PROMPTS` / `MODEL_BY_ROLE` へ inline で持つ。** `agentType` は使わず、`agent()` 呼び出しに `model` と inline prompt（`ROLE_PROMPTS[role]` + diff 指示）だけを渡す。**既知のトレードオフ**: 旧 `.claude/agents/*.md` の `tools: Read, Grep, Glob` / `permissionMode: plan` は harness レベルの技術的強制だったが、agentType を撤去したことでこの技術的強制は失われ、read-only の担保は inline prompt 内の明示的な文章指示（+ 通常の permission gate）に後退している。これは #2478 の意図的な設計判断で、cross-review-workflow.js 冒頭のコメントに同じ注記がある。

script は各 role について `{ role, status: 'ok' | 'empty' | 'error', result }` の配列を返す。`status` が `ok` 以外の role が 1 件でもあれば、Main は次のいずれかを選ぶ:

- 同一 script を再実行する（固定の自動リトライは行わない — 同一条件で同一失敗を再現するだけの可能性があるため、都度 Main が判断する）
- 該当 role だけ素の `Agent` tool 経由（`subagent_type` は指定しない汎用 agent に、`cross-review-workflow.js` の `ROLE_PROMPTS[role]` をそのまま prompt として渡し、text 出力を求める）へ切り替える。この場合、手順 6 の summary comment でその role のエントリを「text-fallback」と明記する（schema 強制を通った結果と区別するため）

`status: 'ok'` の各 role は `result.coverage`（`'complete' | 'partial'`）も持つ（#2417）。budget 逼迫で観点を打ち切った role は `'partial'` を自己申告する契約で、`status !== 'ok'` とは別の軸として扱う — schema 検証自体は通っているが浅い可能性がある、という意味。手順 6 の summary comment に partial である旨と理由（追加確認済み・許容する理由など）を明記する。

Workflow はタスク通知でバックグラウンド完了する。目安 30 分（可逆 checkpoint のタイムアウト既定値。旧 orchestration.md 由来、#2479 で廃止・git 履歴参照）通知が届かなければ、セッション状態を確認した上で対処する。

### 4. 指摘を分類する

- **P1**: 本番でユーザー影響、データ破壊、認可漏れ、または誤課金が起きる
- **P2**: 現実的なエッジケースで誤動作し、修正せずに出荷すべきでない
- **P3**: P1/P2 に満たないが記録に値する指摘（軽微な改善、将来の技術的負債）。**単独では merge を止めない。review comment 化せず、summary コメント本文にだけ書く**（thread 必須解決の対象外。原則 issue 化するか、記録のみで放置してよい）

P1/P2 の定義は `AGENTS.md` の Codex レビュー規則の節と同じものを使う。

### 5. P1/P2 は review comment として投稿する（thread を生成させる）

**summary コメントだけでは、既存の thread-resolve gate（`scripts/tasks/finish-branch.sh` の `isResolved` 走査）が指摘に一切効かない。** issue コメントは `reviewThreads` を生成しないため、P1/P2 を summary コメントに書いて終えると「指摘の黙殺を構造的に不可能にする」（`AGENTS.md §PR / git 運用` §レビュー）が丸ごと失効する。**P3 はこの節の対象外**（手順 4 の通り summary コメントにのみ書く）。

- P1/P2 は `gh api` の reviews エンドポイントで投稿する: `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` で pending review を作成 → 各指摘を `path` + `line`（対象行が明確な場合）または `path` のみ（diff 上に自然な単一行が無い場合のファイルレベル指摘）で comment として追加 → `event: COMMENT` で submit する（`APPROVE` / `REQUEST_CHANGES` は使わない）
- diff 上に自然な行がない P1/P2（rollback 手順の欠如、migration の順序など）は、最も関連するファイルへの comment として必ず付ける。**summary コメントに書いて終えることを禁止する**
- PR 作成者本人（Main と同一 GitHub アカウント）が自 PR に `event: COMMENT` の review を submit できることは実地検証済み（PR #2051 で実測。`state: COMMENTED` で成功し `reviewThreads` にも正しく現れた。自己承認制限は `APPROVE` / `REQUEST_CHANGES` にのみ適用され `COMMENT` には効かない）。**フォールバックが必要になった場合も inline comment を伴う経路に限る**（`gh api` での 1 comment ずつの投稿など）。body だけの `gh pr review --comment`（inline comment なし）は `reviewThreads` を生成せず、二層構造の 2 層目が無音で失効するため使わない。inline comment がどうしても付けられない場合は投稿を諦めず、Main へ状況を報告してから手動で対応する
- 投稿後は `AGENTS.md §PR / git 運用` §レビュー の 3 択（fix を積む / 反論を reply / issue化）+ thread resolve 運用へそのまま接続する

### 6. summary コメントを投稿する（記録のみ、gate 証跡ではない）

**merge を止めるものは何もない。** レビューを実施した記録として、Main が `gh pr comment` で summary コメントを直接投稿する（生成スクリプトは持たない。手で 1 行組み立てる程度の定型文なので、機械生成する複雑さに見合わない）。書式は §投稿フォーマット を参照。role 別 findings 内訳（`findings:` 行）は `pnpm trace` が過去 PR の分析に使うため、書式を保つ。

`agent:` には実際に起動した role をカンマ区切りで書く。手順 3 で text-fallback へ切り替えた role は `role(text-fallback)` の形で書く（`pnpm trace` が集計時に区別する）。

### 7. 収束後、確定伝達する

指摘の 3 択対応が済み thread が全件 resolve されたら、「確定伝達」としてレーンへ通知する。確定伝達には「merge 順で先頭であり追従済みである（以後 main を動かさない）」ことも含めて宣言する。

### 8. HEAD が動いたら再レビューを判断する

指摘対応の fix push や追従（想定外に発生した場合）で HEAD が変わった場合、再レビューが必要かは Main の判断による（機械的な束縛は無い。gate ではないため）。docs だけの commit・追従 merge・保護対象外の lint fix は再レビュー不要。保護対象 path やロジックに実質的な変更が入った場合は、`旧HEAD..新HEAD` の差分だけを対象に re-review し、summary コメントを新しい HEAD に対して投稿し直す（全量の再レビューを毎回要求しない）。

## 投稿フォーマット

```
[review-summary]
head: 4f2a1c9e8b0d3f6a7c5e2b1d9a8f7c6e5d4b3a2f
agent: risk-reviewer, behavior-verifier
P1: なし
P2: 2 件（review comment 参照）
P3: 1 件（型安全性の軽微な改善余地。issue化検討）
```

対象外 diff（docs のみ等、いずれの subagent の自動委任条件にも非該当）の場合:

```
[review-summary]
head: 4f2a1c9e8b0d3f6a7c5e2b1d9a8f7c6e5d4b3a2f
agent: docs-only
対象外 diff（risk-reviewer / behavior-verifier / architecture-guard の自動委任条件に非該当）。
一次情報照合: 記述した path / symbol の実在を rg で確認した。
```

`head:` / `agent:` 行は人と `pnpm trace` のために残してある。**このコメントの書式・投稿の有無は merge を止めない**（advisory）。

## 参考ファイル

| ファイル                             | 用途                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `AGENTS.md §委任・報告の作法`        | subagent 選定基準、model tiering                                                                    |
| `AGENTS.md §PR / git 運用` §レビュー | merge gate の境界（hook + CI check）、指摘後の 3 択・resolve 運用                                   |
| `dispatch` skill                     | このスキルが実行されるタイミング（merge 可能報告の受領）                                            |
| `AGENTS.md`                          | P1/P2 定義の由来（このスキルが生きた正本）                                                          |
| `scripts/tasks/finish-branch.sh`     | CI status-check-rollup 判定・thread-resolve gate（内製・外部レビューの証跡検証は #2596 で削除済み） |
| `scripts/ci/protected-path-gate.mjs` | 保護対象 path の判定（advisory レビューの重さの目安）                                               |
