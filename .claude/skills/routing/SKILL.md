---
name: routing
description: 複数ファイル・複数手順・調査を伴うタスクの着手時、subagent 起動の直前、同じ tool 呼び出しを 3 回以上繰り返した時、Main が実装を自分で始めそうな時に発動。タスクを subtask に分解し L0→L1→L2→L3 の順で最初に解ける層へ流す routing と層ごとの worker recipe を適用する。1 行修正や既存パターン追従の単発編集では発動しない。
effort: low
maxTurns: 10
---

# Routing（分解と実行層への振り分け）

目的は User の利用料を抑えること。強い model（Opus / Fable）は分解・検証・commit だけに使い、実行は最も安い層へ流す。`AGENTS.md` §委任・報告の作法 の L0–L3 表を実際に回すための手順。

**目標状態（2026-09-02 User 定義）**: L2 / L3 が仕事を始める最初の turn の時点で、必要な情報が**選別・圧縮・構造化されて届いている**。選別 = その仕事に要るもの（受け入れ条件・触るファイル・踏襲する既存パターン・制約・検証コマンド）だけ、圧縮 = brief 150 行以内、構造化 = 固定の節順（issue の 4 節 + `pnpm ctx`）、届いている = AI が頼む前に issue コメント / session 開始時に置かれている。距離の測り方は「worker の最初の Edit までの探索 turn 数（Read / Grep / gh）」で、ゼロに近いほど良い。探索が残ったら ctx の選別漏れとして次の版の材料にする。

## When to Use

以下の状況で発動:

- 複数ファイル・複数手順・調査を伴うタスクに着手する時（plan の Minimum Viable Approach を書く前）
- `Agent` / `Workflow` tool で subagent を起動する直前（model と出力契約を決める）
- issue を受け取って「どこから手を付けるか」を考え始めた時
- 同じ種類の tool 呼び出し（`gh` / `Read` / `Grep`）を 3 回以上繰り返していると気づいた時
- Main の session が Read → Edit の実装ループを自分で始めそうな時（L3 が L2 の仕事をしている兆候）
- subagent の報告を受け取り、次の subtask を決める時

## 手順

1. **分解表を書く**。issue コメント（issue が無ければ PR 本文）に置く。会話の中だけに置かない

   | #   | subtask | tier | 入力（path / issue / 前 subtask の出力） | 受け入れ条件 | 出力契約 |
   | --- | ------- | ---- | ---------------------------------------- | ------------ | -------- |

2. **tier を上から順に判定する**。最初に yes になった層で止める
   - **L0** — 既存の script / CLI / pipeline で閉じるか。`pnpm run` 一覧・`gh --json --jq`・`rg`・`git log -S`・`jq` を先に探す。3 回以上繰り返す tool 呼び出しは script（`scripts/tasks/`）に畳む候補
   - **L1** — 判断を含まないか（列挙・突合・蒸留・定型抽出・一括置換の下調べ）。yes なら Haiku。外部リサーチが要るなら User の Deep Research（issue §やること に「Deep Research 依頼: <問い>」を書き `status:blocked`。結果は User がコメントに貼る）。**L1 は Haiku で固定**（2026-09-02）。ローカル LLM は agent ではなく L0 の wrapper（要約だけ返す tool）として、Haiku 構成比が 3 か月連続で 5% を超え L1 が待ち時間のボトルネックになった時にだけ検討する
   - **L2** — 受け入れ条件と検証コマンドを文章で書けるか。yes なら Sonnet
   - **L3** — 設計判断・矛盾報告の裁定・不可逆操作・commit。Main（Opus / Fable）が自分でやる
3. **委譲時は `model` を必ず明示し、recipe の出力契約を prompt に含める**。思考量（effort）は **Medium を既定**にし、high は判断を含む skill（`security` / `supabase`）だけ。既定で安定する条件は brief が Sonnet レベル（受け入れ条件 + 検証コマンド、`ctx` の判断の記録で確認）に落ちていることと、詰まったら粘らず止まって報告する規律（AGENTS.md §レーン運用）。write 可能な委譲は `AGENTS.md` の 4 条件（同一 worktree / 非重複 scope / commit 前に Main が diff レビュー / commit・push・外部 state は Main）
4. **戻ってきた出力は Main が検証してから次へ進む**。diff・検証コマンドの出力末尾・出力契約との一致を見る。「passed」の一言だけで進めない
5. 分解表の tier 列と実績（実際に使った model）がずれたら、表を直してから次の subtask へ（ずれの蓄積は月次 gardening の `pnpm ai:usage` で見える）

## Worker recipe

### L0（LLM を使わない）— カタログ

L0 と呼べる入口の条件は 3 つ。raw コマンドがこれを満たすなら wrapper を作らない。

1. 既定の出力が 30 行前後の判断可能な要約で、`--json` で機械可読にもなる
2. exit code に意味があり、stdin を待たない（対話 prompt を出さない）
3. 失敗は `未取得` と明記して fail-closed。黙って空を返さない

| 分類       | 能力                    | 入口                                                                                    | 射影の書き方                                           | 状態                                                 |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Repository | search                  | `rg -n <pat> <path>`                                                                    | `-l` / `-c` で件数から入り、本文は `-m` と head で絞る | raw で十分                                           |
| Repository | diff / log / blame      | `git diff --stat`、`git log --oneline -S<sym>`、`git blame -L`                          | `--stat` → 必要な path だけ `-- <path>`                | raw で十分                                           |
| Repository | 依存グラフ              | `pnpm lint:boundaries`、`pnpm deps:circular`、`rg -l "from '.*<name>'"`                 | 「誰が import しているか」は `rg -l`                   | 候補: `pnpm deps <path>`                             |
| Validation | typecheck / lint / test | `pnpm check`（個別は `pnpm typecheck` / `lint` / `test:run`）                           | tail 20 行、失敗行は `rg "error\|FAIL"`                | あり                                                 |
| Validation | E2E                     | `pnpm test:e2e:smoke`、nightly 層 3                                                     | 結果は `gh run view`                                   | あり                                                 |
| Infra      | CI 状態                 | `gh pr checks <N> [--watch]`、`pnpm green:watch --once`                                 | `--json` + `--jq`                                      | あり。候補: `pnpm pr:advance <N>`（追従→待ち→ready） |
| Infra      | Vercel                  | `vercel ls`、`vercel inspect [--logs] <url>`、`vercel logs <url> --json`                | head / tail、`jq 'select(.level=="error")'`            | raw で十分（MCP は登録しない）                       |
| Infra      | Supabase query          | `pnpm db:*`、`psql`（cloud MCP はオンデマンド）                                         | 行数上限を必ず付ける                                   | 候補: `pnpm db:sql`（read-only 固定・行数上限）      |
| Infra      | Sentry                  | `sentry` CLI（`mcp-usage` skill §Sentry CLI）                                           | issue 1 件ずつ                                         | あり                                                 |
| Automation | polling                 | `gh pr checks --watch`、`pnpm green:watch --follow`                                     | 遷移だけ読む                                           | あり                                                 |
| Automation | bulk / 変換             | `sed -i`、`jq`、`node -e`                                                               | 対象一覧を先に `rg -l` で確定してから一括              | ad-hoc（同じ形が 2 回出たら script 化）              |
| Automation | context pack            | `pnpm ctx <issue または PR>`                                                            | 150 行以内で完結、`次の一手` を読む                    | あり                                                 |
| 配達       | worker への brief       | `pnpm ctx N --post`（`dispatch` 操作 A 手順 7。再実行で同じコメントを更新）             | 150 行以内                                             | あり                                                 |
| 配達       | Main への brief         | SessionStart hook が branch 名の issue 番号から `pnpm ctx N` を注入                     | 5 秒予算内                                             | 候補（`scripts/hooks/**` は保護対象、別 PR）         |
| 観測       | 着手までの探索 turn 数  | `pnpm ai:usage` 表 E（subagent の最初の Edit 以前の探索 tool 回数）                     | model 別 1 行                                          | あり（目標状態との距離）                             |
| 観測       | 判断のトレース          | `pnpm trace <PR>`（session 群 → 判断の記録 → レビュー → 結果を issue / PR 番号で join） | 120 行以内。判定は人                                   | あり（保存は増やさない。pull 型のみ）                |
| 観測       | 経済メトリクス          | `pnpm ai:usage`                                                                         | 月次 gardening の journal に貼る                       | あり                                                 |

**Observability の目標状態（2026-09-02 User 定義）**: 「AI が何を見て、なぜその判断をし、何を実行し、その判断が正しかったか」を追跡できる。保存は増やさず、session ログ・git・GitHub・`decisions.md` を issue / PR 番号で join する pull 型（`pnpm trace`）に限る。「なぜ」は tool ではなく書く規律（分解表 / DoD / decisions.md）で、`ctx` の「判断の記録」行が欠落を着手時に知らせる。「正しかったか」の信号は DoD と PR 本文の突き合わせ・Codex 指摘数・`結果(未):` の回収率の 3 つ。

**AI が頼む前に走る層**: SessionStart hook（git 状態・token 構成比）、pre-commit / pre-push、CI 4 層、`branch:finish` の 10 ゲート。新しい確認を足す時は、まず「hook / CI で AI より先に走らせられないか」を考える。

**育て方**: (1) 同じ形の tool 連鎖が 2 回出たら「候補」に載せる（`ai:usage` の Bash 頻出 prefix と最長 tool 連鎖が月次の証拠） (2) 作る前に raw で上の 3 条件を満たせないか確認する (3) wrapper は `scripts/tasks/` に置き `pnpm <name>` で呼ぶ（taxonomy test が配置を強制） (4) 1 つ足したらこの表を更新し、2 か月使われない行は削る

- **巨大出力は context に入れる前に射影する**: `Read` は範囲指定、MCP の list 系や `gh api` は `--jq` で必要キーだけ、長い出力は tail / head で切る。tool_result の Read が全体の半分を占めた実測（2026-08）がある

### L1（Haiku）prompt 骨格

```
Agent({ model: 'haiku', prompt: `
<対象（path / issue 番号 / 貼り付けたログ）> を <観点> で <列挙 | 突合 | 蒸留 | 抽出> する。
判断・提案・修正はしない。分からない項目は「不明」と書く。
出力は次の固定形式のみ: <markdown 表の列定義 or JSON のキー一覧>
` })
```

用途例: transcript / ログの蒸留（状態・進捗・懸念・待ち の 4 行）、issue 一覧の分類、ファイル一覧と責務の突合、置換対象の列挙、レビュー指摘の class 分類

### L2（Sonnet）prompt 骨格

```
Agent({ model: 'sonnet', prompt: `
<issue URL または分解表の行>。
受け入れ条件: <…>。検証コマンド: <…>。既存パターン: <path>（構造を踏襲する）。
触ってよい path: <…>。commit / push / stage はしない。
最終報告に 変更ファイル一覧・検証コマンドと出力末尾・未確認事項 を書く。
` })
```

用途例: 受け入れ条件が明確な実装、調査（結論 + 根拠 path を要求）、テスト追加、docs 更新

### L3（Main）

分解表の作成、subagent 報告の独立検証（矛盾する報告は再検証してから動く）、レビュー指摘の裁定、commit、User への報告。実装ループに入ったら L2 へ戻す。

## 反例

- Main が 5 ファイルを Read → Edit し始める（L3 が L2 の仕事をしている）
- Haiku に「重要なものを選べ」と頼む（基準が無い判断は L1 では解けない）
- `gh … --json | jq` で足りる集計を Sonnet に文章で依頼する（L0 を飛ばしている）
- subagent の model を省略して起動する（Main の tier を継承し最も高い構成になる。2026-08 の「編集なし」subagent は Opus 154 件で、大半がこの継承）
- **編集を伴わない探索・調査の subagent に Opus / Fable を使う**。例外は反証レビュー（`pr-cross-review` の risk-reviewer）と矛盾報告の独立再検証だけ。目標は「編集なしの Opus / Fable 件数 = 反証の実行回数」で、`ai:usage` 表 E の下の 1 行で毎月確認する

## When NOT to Use

- 1 ファイル 1 行の修正、既存パターン追従の単発編集（`AGENTS.md` §委任・報告の作法 の表で足りる）
- issue を worker へ渡す GitHub 側の手順・ラベル操作（`dispatch` skill の領域）
- merge 前のクロスレビュー（`pr-cross-review` skill の領域）
