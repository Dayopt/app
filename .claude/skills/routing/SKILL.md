---
name: routing
description: 複数ファイル・複数手順・調査を伴うタスクの着手時、subagent 起動の直前、同じ tool 呼び出しを 3 回以上繰り返した時、Main が実装を自分で始めそうな時に発動。タスクを subtask に分解し L0→L1→L2→L3 の順で最初に解ける層へ流す routing と層ごとの worker recipe を適用する。1 行修正や既存パターン追従の単発編集では発動しない。
effort: low
maxTurns: 10
---

# Routing（分解と実行層への振り分け）

目的は User の利用料を抑えること。強い model（Opus / Fable）は分解・検証・commit だけに使い、実行は最も安い層へ流す。`AGENTS.md` §委任・報告の作法 の L0–L3 表を実際に回すための手順。

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
   - **L1** — 判断を含まないか（列挙・突合・蒸留・定型抽出・一括置換の下調べ）。yes なら Haiku。外部リサーチが要るなら User の Deep Research（issue §やること に「Deep Research 依頼: <問い>」を書き `status:blocked`。結果は User がコメントに貼る）
   - **L2** — 受け入れ条件と検証コマンドを文章で書けるか。yes なら Sonnet
   - **L3** — 設計判断・矛盾報告の裁定・不可逆操作・commit。Main（Opus / Fable）が自分でやる
3. **委譲時は `model` を必ず明示し、recipe の出力契約を prompt に含める**。write 可能な委譲は `AGENTS.md` の 4 条件（同一 worktree / 非重複 scope / commit 前に Main が diff レビュー / commit・push・外部 state は Main）
4. **戻ってきた出力は Main が検証してから次へ進む**。diff・検証コマンドの出力末尾・出力契約との一致を見る。「passed」の一言だけで進めない
5. 分解表の tier 列と実績（実際に使った model）がずれたら、表を直してから次の subtask へ（ずれの蓄積は月次 gardening の `pnpm ai:usage` で見える）

## Worker recipe

### L0（LLM を使わない）

- 定型検証: `pnpm check` / `pnpm test:scripts` / `pnpm typecheck` / `gh pr checks <N> --watch`
- 状態取得: `gh pr view <N> --json mergeStateStatus,reviewDecision,statusCheckRollup --jq …` / `gh issue list --label status:ready --json number,title` / `git worktree list --porcelain`
- 履歴: `git log -S<symbol> --oneline` / `git log --merges --since`
- **巨大出力は context に入れる前に射影する**: `Read` は範囲指定、MCP の list 系や `gh api` は `--jq` で必要キーだけ、長い出力は `| tail -n` / `| head -c`。tool_result の Read が全体の半分を占めた実測（2026-08）がある

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
- subagent の model を省略して起動する（Main の tier を継承し最も高い構成になる）

## When NOT to Use

- 1 ファイル 1 行の修正、既存パターン追従の単発編集（`AGENTS.md` §委任・報告の作法 の表で足りる）
- issue を worker へ渡す GitHub 側の手順・ラベル操作（`dispatch` skill の領域）
- merge 前のクロスレビュー（`pr-cross-review` skill の領域）
