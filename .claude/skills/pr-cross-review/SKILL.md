---
name: pr-cross-review
description: 指揮台がレーンから merge 可能報告を受けた時、束ねた PR の merge 前クロスレビュー時、auth / RLS / billing / migration / 公開契約等の diff を merge 前に確認する時に発動。Codex へ `@codex review` を投げ、内製 subagent（risk-reviewer / behavior-verifier）を並列実行し、`[internal-review]` marker 付きで指摘を PR へ投稿する。実装では発動しない。
effort: medium
maxTurns: 20
---

# PR クロスレビュー スキル

指揮台が merge 前に実行するクロスレビューの標準手順。**クロスレビュー必須 PR は内製 subagent と Codex の独立 2 系統が揃って初めて merge できる**（#2529、2026-09-01）。全 PR への Codex 適用を止めた 2026-08-13 の判断は、必須 PR に限りここで撤回した — 同一モデル系列の中で役割を分けただけのレビューを「独立」とは呼べないため、別 provider の反証を hard gate に載せる。低リスク PR のテンポは変えない（Codex を起動しない）。

2 系統の役割分担:

| 系統  | 起動方法                       | 証跡                                                      | 何を担保するか                                |
| ----- | ------------------------------ | --------------------------------------------------------- | --------------------------------------------- |
| 内製  | `Workflow`（手順 3）           | `[internal-review]` marker（`head:` で現 HEAD へ束縛）    | repo 固有の不変条件・アーキテクチャ・挙動検証 |
| Codex | PR へ `@codex review` コメント | Codex 自身が投稿した review object（`commit.oid` で束縛） | 別 provider による反証・観点差                |

**Codex 側は marker を作らない。** Main が書けるコメントでは「Codex が実行された」ことも「同じ diff を読んだ」ことも証明できず、独立性の主張が自己申告に戻るため（#2529 実装前レビュー P1）、`scripts/tasks/finish-branch.sh` は Codex 自身の review object（`chatgpt-codex-connector`）を直接検証する。Codex の失敗（error / timeout / usage limit / 空応答）は「現 HEAD の review object が存在しない」に帰着するので、失敗モードを列挙せずとも fail closed になる。**バイパス marker は作らない** — 可用性が実害化したら gate を黙って弱めず、別 issue で evidence を集めて範囲を再判断する。

**この gate は `pnpm branch:finish` 経路の機械強制**であり、GitHub の required check ではない（private repo + Free plan では server-side の required check 強制が効かない。既存の全 gate と同じ性質）。UI / API から直接 merge すればすり抜けられる点は既知で、`branch:finish` を標準経路とする運用契約の上に乗っている。Codex provider 障害で gate 自体を直す PR が止まった場合も、この性質が復旧経路になる（owner が内製レビュー済みの revert PR を UI から merge し、PR にその経緯を残す）。日常のバイパスとしては使わない。

`AGENTS.md §PR / git 運用` §レビュー が要求するレビュー痕跡は、このスキルが生成する `[internal-review]` marker 付きコメント + inline review comment + Codex の review object で満たす。

**このレビューが必須になる PR は保護対象 path / `review:full` ラベル / linked issue（`Closes #N`）の `review:full` に該当する PR に限る**（2026-08、#2478、レビュー gate のテンポ連動化。linked issue の継承は #2530）。保護対象の選定基準は「外部契約 or 不可逆」に絞ってあり、timeblock / calendar / lib/time の時間不変条件は必須側から外れている（#2489、2026-08-31）。ただし `features/timeblock/server/mcp-*` と `private-timeblock-search-query.ts` は、同じ feature に同居する MCP 公開契約 / service role クエリ / privacy 境界として必須側に残る。判定は `scripts/ci/protected-path-gate.mjs` が正本で、`scripts/tasks/finish-branch.sh` の merge gate から呼ばれる。該当しない可逆な変更は、CI green + 既存 review thread の resolve だけで merge できる（marker gate を求めない）。

**常設の subagent 定義（`.claude/agents/*.md`）は 2026-08 に全廃した（#2478）。** risk-reviewer / behavior-verifier / architecture-guard の persona・read-only 契約・review scope は、`.claude/skills/pr-cross-review/cross-review-workflow.js` の `ROLE_PROMPTS` へ inline prompt として畳み込んである（下記手順 3 参照）。role 名は `Workflow` 呼び出し時のラベル・schema 選択キーとしてのみ残り、`Agent` tool の `subagent_type` としては存在しない。

## When to Use

**副次トリガー型** — 「コード変化」ではなく「レーンから merge 可能報告を受けた」という上位イベント確定後に発動する。

**上位イベント起点:**

- レーンが軽量 CI green を確認し merge 可能報告を指揮台へ送った時（`dispatch` skill の指揮台運用）
- 複数 issue / 複数 Step を束ねた PR が merge 前クロスレビュー必須の対象になった時（`AGENTS.md §PR / git 運用` §レビュー）

**診断起点:**

- 自動委任条件（auth / RLS / service role / OAuth / webhook / billing / redirect / migration / `SECURITY DEFINER/INVOKER` / 現在挙動・公開契約・state transition・query cache・temporal contract・bug regression / cross-feature import・barrel・Composition Layer・file move・依存方向。正本は本 skill 手順 2 の表）に該当する diff を merge 前に見つけた時

## When NOT to Use

- push 前の自己反証レビュー（レーン自身が push 前に行う敵対的セルフレビュー。subagent は同じでも実行主体と目的が異なる — このスキルは merge 前の指揮台側レビュー）
- plan 段階のレビュー（このスキルは merge 前の diff レビュー専用。plan の妥当性検証は `AGENTS.md §実装 Plan の必須セクション` に従う）
- 実装そのもの（write 可能な subagent への委譲は `AGENTS.md §委任・報告の作法` の writer 4 条件に従う。このスキルは read-only）

## 手順

### 0. Codex へレビューを投げる（内製 findings を投稿する前に）

クロスレビュー必須 PR では、**内製レビューの findings を PR へ投稿する前に**、現在の HEAD で Codex を起動する:

```bash
gh pr comment <PR番号> --body "@codex review"
```

**順序が独立性の機械化そのもの。** Codex は PR の現在のスナップショットを読むため、内製 findings をまだ投稿していない時点で起動すれば、Codex の入力に内製 findings が構造的に含まれない（prompt に混ぜない、という約束を運用ではなく順序で担保する）。逆方向（Codex findings を内製 subagent の prompt へ渡す）も行わない — 手順 3 の `args` には diff path しか渡さない。

- Codex は PR 全体を全量レビューする。**delta review の概念を Codex 側に持ち込まない**（旧 HEAD の review を積み上げて範囲の連続性を主張する経路を作らない、#2529 実装前レビュー P2）
- push で HEAD が動いたら Codex 証跡も無効になる。fix round のたびに `@codex review` を投げ直す
- Codex の返信を待つ間に手順 1〜3（内製レビュー）を進めてよい。両者が揃ってから手順 4 で統合する
- Codex の指摘は inline review comment として届くため `reviewThreads` を生成し、既存の thread-resolve gate がそのまま解決を強制する（内製指摘と同じ 3 択: fix を積む / 反論を reply / issue 化）。**Codex 側のために新しい解決機構は要らない**
- Codex が body だけの review（inline comment 無し）で P1/P2 相当を書いてきた場合は、Main が手順 5 の経路で inline comment へ正規化する。summary に書いて終えない

### 1. 対象 diff を読み取り可能な形にする

**指揮台（Main）自身が** `gh pr diff <PR番号>` を実行し、出力を絶対パスのファイル（例: スクラッチパス配下）へ書き出す。subagent（`risk-reviewer` / `behavior-verifier` / `architecture-guard`）は `Read` / `Grep` / `Glob` しか持たず `Bash` が無いため、subagent 自身に `gh pr diff` を叩かせることはできない。

- subagent へは、この絶対パスファイルを一次情報として渡す。cwd 相対の `Read` に頼った実装は禁止（指揮台は main checkout 常駐のため、経路を明示しないと main の内容を読んでしまう）
- PR の worktree（`.claude/worktrees/<name>/`）が存在し、かつ `git -C <worktree> status --porcelain` が空、かつ HEAD が対象 PR の `headRefOid` と一致する場合に限り、worktree 直読みを補助的な追加コンテキストとして使ってよい（diff ファイルの代替にはしない）

### 2. subagent を選ぶ

レーンから push-ready 報告 / レビュー待ち報告に添付された push 前セルフレビューの subagent 生出力（`AGENTS.md §レーン運用`、策定日: 2026-08-25、[#2374](https://github.com/Dayopt/dayopt/issues/2374)）があれば、まずそれを一次資料として読む。

- **自動委任条件に該当する diff**（下記表参照）では、レーン添付の有無に関わらず指揮台の独立実行を維持する（既定不変 — 同一 agent 系列の自己申告に検証を委ねない）
- **非該当・低リスク diff**（docs-only を含む）では、レーン添付 findings を検証した上で指揮台の独立実行を省略してよい。省略した場合、手順 6 の summary comment の経緯欄に「レーン添付 findings を検証、独立実行省略」と明記する。レーンの添付は自己申告であり指揮台の検証代替ではない（出発点の提供に留まる）ため、「検証した」と書けるのは実際に一次情報（diff・path・symbol）と突き合わせた場合に限る

独立実行するかどうかは、下記の自動委任条件表（この表が正本）に照らして選ぶ:

- auth / RLS / service role / OAuth / webhook / billing / redirect / migration / `SECURITY DEFINER/INVOKER` → `risk-reviewer`
- 現在挙動 / 公開契約 / state transition / query cache / temporal contract / bug regression → `behavior-verifier`
- cross-feature import / barrel / Composition Layer / file move / 依存方向 → `architecture-guard`
- いずれにも該当しない場合（docs-only 等）、subagent は起動しない。§投稿フォーマット の「対象外 diff」形式で記録する

### 3. 並列実行する（Workflow + schema 強制）

該当する subagent を `Workflow` tool で並列実行する。**素の `Agent` tool は使わない**（StructuredOutput を機構的に強制できず、書き出し停止の再発源だったため。#2227 の prompt 契約適用後も1日5回再発し、#2348 で構造的強制へ移行した）。

指揮台は常に main checkout（repo root）に常駐する（旧 orchestration.md §指揮台セッションの定義、#2479 で廃止・git 履歴参照）ため、`scriptPath` は repo root 基点で `.claude/skills/pr-cross-review/cross-review-workflow.js` を指定する。`args` に手順 1 の diff ファイル絶対パスと選定した reviewer 一覧（`risk-reviewer` / `behavior-verifier` / `architecture-guard` のいずれか）を渡す:

```
Workflow({
  scriptPath: ".claude/skills/pr-cross-review/cross-review-workflow.js",
  args: { diffPath: "<手順1の絶対パス>", reviewers: ["risk-reviewer", "behavior-verifier"] }
})
```

**role ごとの persona・read-only 契約・review scope・model は、`.claude/agents/*.md`（2026-08 に全廃、#2478）の代わりに `cross-review-workflow.js` の `ROLE_PROMPTS` / `MODEL_BY_ROLE` へ inline で持つ。** `agentType` は使わず、`agent()` 呼び出しに `model` と inline prompt（`ROLE_PROMPTS[role]` + diff 指示）だけを渡す。**既知のトレードオフ**: 旧 `.claude/agents/*.md` の `tools: Read, Grep, Glob` / `permissionMode: plan` は harness レベルの技術的強制だったが、agentType を撤去したことでこの技術的強制は失われ、read-only の担保は inline prompt 内の明示的な文章指示（+ 通常の permission gate）に後退している。これは #2478 の意図的な設計判断で、cross-review-workflow.js 冒頭のコメントに同じ注記がある。

script は各 role について `{ role, status: 'ok' | 'empty' | 'error', result }` の配列を返す。`status` が `ok` 以外の role が 1 件でもあれば、手順 6 の marker 生成は機械的に拒否される（`--review-result` 参照）。その場合 Main は次のいずれかを選ぶ:

- 同一 script を再実行する（固定の自動リトライは行わない — 同一条件で同一失敗を再現するだけの可能性があり、1 週間の効果測定の解像度も下げるため、都度 Main が判断する）
- 該当 role だけ素の `Agent` tool 経由（`subagent_type` は指定しない汎用 agent に、`cross-review-workflow.js` の `ROLE_PROMPTS[role]` をそのまま prompt として渡し、text 出力を求める）へ切り替える。この場合、手順 6 の `--review-result` JSON でその role のエントリを `status: "text-fallback"` にする（schema 強制を通った marker と区別するため。効果測定を汚染しないための必須事項）。**text-fallback は `coverage` を機械的に追跡できない**（text contract は schema を強制しないため）。partial coverage の safeguard（手順6）は text-fallback role には適用されない

`status: 'ok'` の各 role は `result.coverage`（`'complete' | 'partial'`）も持つ（#2417）。budget 逼迫で観点を打ち切った role は `'partial'` を自己申告する契約で、`status !== 'ok'` とは別の軸として扱う — schema 検証自体は通っているが浅い可能性がある、という意味。手順 6 の `--partial-coverage-note` 必須化がこの信号を marker の gate へ橋渡しする。

Workflow はタスク通知でバックグラウンド完了する。目安 30 分（可逆 checkpoint のタイムアウト既定値。旧 orchestration.md 由来、#2479 で廃止・git 履歴参照）通知が届かなければ、セッション状態を確認した上で対処する。

### 4. 指摘を分類する

- **P1**: 本番でユーザー影響、データ破壊、認可漏れ、または誤課金が起きる
- **P2**: 現実的なエッジケースで誤動作し、修正せずに出荷すべきでない
- **P3**: P1/P2 に満たないが記録に値する指摘（軽微な改善、将来の技術的負債）。**単独では merge を止めない。review comment 化せず、summary コメント本文にだけ書く**（thread 必須解決の対象外。原則 issue 化するか、記録のみで放置してよい）

P1/P2 の定義は `AGENTS.md` の Codex レビュー規則と同じものを両系統へ適用する（どちらが見つけたかで扱いを変えない）。

**両系統が揃ってから Main が統合する。** 内製と Codex は「相談して 1 回レビュー」ではなく、同じ一次情報を別々に読む独立レビューなので:

- reviewer 同士の一致を成功条件にしない。観点差・反証・片方だけの finding に価値がある
- 同じ指摘を両者が挙げた場合、thread は 1 本に統合してよい。ただし「両方が独立に検出した」事実は手順 6 の summary に残す
- 両者の結論が食い違う場合、Main が一次情報（diff / test / migration）で裁く。AI 間の合意を証拠として扱わない

### 5. P1/P2 は review comment として投稿する（thread を生成させる）

**`[internal-review]` marker 付きの単一 issue コメントだけでは、既存の thread-resolve gate（`scripts/tasks/finish-branch.sh` の `isResolved` 走査）が内製指摘に一切効かない。** issue コメントは `reviewThreads` を生成しないため、P1/P2 を summary コメントに書いて終えると「指摘の黙殺を構造的に不可能にする」（`AGENTS.md §PR / git 運用` §レビュー）が丸ごと失効する。**P3 はこの節の対象外**（手順 4 の通り summary コメントにのみ書く）。

- P1/P2 は `gh api` の reviews エンドポイントで投稿する: `POST /repos/{owner}/{repo}/pulls/{pr}/reviews` で pending review を作成 → 各指摘を `path` + `line`（対象行が明確な場合）または `path` のみ（diff 上に自然な単一行が無い場合のファイルレベル指摘）で comment として追加 → `event: COMMENT` で submit する（`APPROVE` / `REQUEST_CHANGES` は使わない）
- diff 上に自然な行がない P1/P2（rollback 手順の欠如、migration の順序など）は、最も関連するファイルへの comment として必ず付ける。**summary コメントに書いて終えることを禁止する**
- PR 作成者本人（指揮台と同一 GitHub アカウント）が自 PR に `event: COMMENT` の review を submit できることは実地検証済み（PR #2051 で実測。`state: COMMENTED` で成功し `reviewThreads` にも正しく現れた。自己承認制限は `APPROVE` / `REQUEST_CHANGES` にのみ適用され `COMMENT` には効かない）。**フォールバックが必要になった場合も inline comment を伴う経路に限る**（`gh api` での 1 comment ずつの投稿など）。body だけの `gh pr review --comment`（inline comment なし）は `reviewThreads` を生成せず、二層構造の 2 層目が無音で失効するため使わない。inline comment がどうしても付けられない場合は投稿を諦めず、指揮台へ状況を報告してから手動で対応する
- 投稿後は `AGENTS.md §PR / git 運用` §レビュー の 3 択（fix を積む / 反論を reply / issue化）+ thread resolve 運用へそのまま接続する

### 6. summary コメントを投稿する（marker、gate 証跡）

P1/P2 の review comment とは別に、**1 件の summary comment** を issue コメントとして投稿する。1 行目を `[internal-review]` で始め、以下を含める（`scripts/tasks/finish-branch.sh` の gate 判定に必要な必須フィールド）:

- `head: <PR の現在の HEAD SHA、40 桁 hex>`
- `agent: <実行した subagent 名をカンマ区切り、または docs-only>`
- P1/P2/P3 の件数サマリー（inline review comment の一覧を指す旨も添える）

**marker 本文は `pnpm review:marker` で生成する（手書きしない）。** SHA の捏造（短縮 SHA からの補完、2026-08-14 実事故）と zerolike 書式の汚染（注釈付き `P1: なし（…）` が gate を誤通過させた PR #2053 の実事故）を、生成の機械化で防ぐ（`scripts/tasks/generate-marker.ts`、#2230）。

**手順 3 で reviewer を起動した場合（docs-only 以外）は `--agent` ではなく `--review-result` を使う。** 手順 3 の Workflow が返した `{role, status, result}[]` を、Main が `Write` tool でそのまま JSON ファイルへ書き出し、そのパスを渡す（#2348）。`status` が `ok`/`text-fallback` 以外の role が 1 件でもあれば生成が失敗する — これは「1 role が結果を返していないのに手で `--agent` へ書いて gate を通す」抜け道を、値の手入力自体を無くして塞ぐための機械的ガード:

```bash
pnpm review:marker <PR番号> --review-result /path/to/review-result.json \
  --p1 0 --p2 2 --p2-note "review comment 参照" [--p3 "..."]
```

docs-only 等 reviewer を起動しなかった場合は従来どおり `--agent` を直接指定する（`--agent` と `--review-result` は併用不可）:

```bash
pnpm review:marker <PR番号> --agent docs-only --p1 0 --p2 0
```

**`--review-result` のいずれかの role が `coverage: 'partial'`（budget 逼迫で観点を打ち切った自己申告、#2417）を報告している場合、`--partial-coverage-note` が無いと生成が失敗する。** pacing discipline を緩めて早期の StructuredOutput 呼び出しを許可すると、「schema 上は正常だが浅いレビュー」が `status: 'ok'` のまま marker を素通りしうる（fail-open）。これを黙って通さず、Main による明示的な扱い（追加確認済み・許容する理由など）を書かせる:

```bash
pnpm review:marker <PR番号> --review-result /path/to/review-result.json \
  --p1 0 --p2 0 --partial-coverage-note "risk-reviewer の partial 分は diff 該当箇所を Main が目視確認済み"
```

**この防止線が効くのは `pnpm review:marker` 経由の生成時のみ。** `finish-branch.sh` の merge gate 自体は `partial coverage:` 行を一切パース・要求しない（`agent:` フィールドと同じ trust boundary — gate は marker の存在・書式だけを見る）。手書き marker や手組み JSON で `pnpm review:marker` を経由しなければ、この安全網は素通りする（PR #2424 クロスレビュー P2）。

head SHA は script が `gh pr view --json headRefOid` で実測する（引数で渡す口は無い）。P1/P2 が 0 件の時は注釈を付けられない（zerolike 書式を維持するため。理由は P3 か経緯欄へ）。**stdout の出力を目視確認してから** `gh pr comment <PR番号> --body "<出力>"` 等で投稿する — 生成と投稿を分けているのは、投稿前に 1 拍置く確認ステップを残すため。

`agent:` の値は自己申告であり、gate は非空であることしか検証しない（機械的な docs-only 判定はしない）。この trust boundary は marker を OWNER / MEMBER / COLLABORATOR しか投稿できない、という既存の権限境界に依っている。

### 7. 収束後、確定伝達する

指摘の 3 択対応が済み thread が全件 resolve されたら、「確定伝達」としてレーンへ通知する。確定伝達には「merge 順で先頭であり追従済みである（以後 main を動かさない）」ことも含めて宣言する。

### 8. HEAD が動いたら両系統を張り直す

指摘対応の fix push や追従（想定外に発生した場合）で HEAD が変わったら、**内製・Codex の両方**の証跡が新しい HEAD に対して必要になる。

- **内製**: `旧HEAD..新HEAD` の差分だけを対象に re-review し、新しい HEAD SHA を指す summary comment を投稿し直す（全量の再レビューを毎回要求しない）
- **Codex**: `@codex review` を投げ直す。Codex は毎回 PR 全体を読むため、delta の連続性を人が主張する余地が無い（証跡は常に「その commit の全量レビュー」）

内製側の gate 判定:gate は「取得窓（直近 100 件）内に、現在の HEAD を指す有効な `[internal-review]` marker が 1 件以上あること」を見る（過去の marker を明示的に無効化する仕組みは無く、古い head を指す marker はそもそも一致しないため実質的に効かなくなる）。

**書式を誤った marker は窓内に残ると gate を塞ぎ続ける。** gate は「最新の marker」だけでなく窓内の**全 marker を any 判定**する（`scripts/tasks/finish-branch.sh` の `INTERNAL_REVIEW_CLAIMS_FINDINGS`）ため、正しい書式の新しい marker を投稿しても、窓内に残る誤書式の古い marker 1 件（例: §投稿フォーマット の zerolike 判定に落ちる注釈付き `P1: なし（…）`）が非ゼロ申告と誤認され続け、対応する review comment が無いまま停止する。復旧は当該コメントの削除または編集のみ（新しい marker の追加投稿では解決しない）。PR [#2053](https://github.com/Dayopt/dayopt/pull/2053) の初運用でこの型で 2 度停止し、汚染 marker を削除してから通過した。

## 投稿フォーマット

**P1/P2 行でゼロ件を申告する時は、値を `なし` / `0` / `0件` / `0 件` / `None` のいずれかのみにする。同一行に注釈・括弧書きを付けない。**gate の zerolike 判定（`scripts/tasks/finish-branch.sh` の `zerolike`）は完全一致の正規表現のため、`P1: なし（注釈…）` のような括弧注釈付きはゼロ件と認識されず非ゼロ申告と誤認され、対応する review comment が見つからず gate が停止する。ゼロ件の理由や補足を書きたい場合は別行にするか P3 / 経緯欄へ書く（非ゼロ件数を申告する行は下の例の P2 のように注釈を付けてよい。zerolike 判定の対象外なので gate 判定に影響しない）。

```
[internal-review]
head: 4f2a1c9e8b0d3f6a7c5e2b1d9a8f7c6e5d4b3a2f
agent: risk-reviewer, behavior-verifier
P1: なし
P2: 2 件（review comment 参照）
P3: 1 件（型安全性の軽微な改善余地。issue化検討）
```

対象外 diff（docs のみ等、いずれの subagent の自動委任条件にも非該当）の場合:

```
[internal-review]
head: 4f2a1c9e8b0d3f6a7c5e2b1d9a8f7c6e5d4b3a2f
agent: docs-only
対象外 diff（risk-reviewer / behavior-verifier / architecture-guard の自動委任条件に非該当）。
一次情報照合: 記述した path / symbol の実在を rg で確認した。
```

タグだけで中身が空、`head:` 欠落・不一致、`agent:` 欠落のいずれかがあるコメントは gate を通過しない（`scripts/tasks/finish-branch.sh` §内製クロスレビューの実施を要求する gate）。

## 参考ファイル

| ファイル                              | 用途                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `AGENTS.md §委任・報告の作法`         | subagent 選定基準、model tiering                                                                          |
| `AGENTS.md §PR / git 運用` §レビュー  | 指摘後の 3 択・resolve 運用                                                                               |
| `dispatch` skill                      | このスキルが実行されるタイミング（merge 可能報告の受領）                                                  |
| `AGENTS.md`                           | 凍結された P1/P2 定義の由来（このスキルが生きた正本）                                                     |
| `scripts/tasks/finish-branch.sh`      | `[internal-review]` marker の gate 判定ロジック                                                           |
| `scripts/tasks/generate-marker.ts`    | `[internal-review]` marker 本文の生成（SHA 実測・zerolike 書式強制）                                      |
| `scripts/tasks/issue-review-gate.mjs` | linked issue の Codex Issue Review 証跡の検証（#2530、`dispatch` skill 操作A と merge gate から呼ばれる） |
