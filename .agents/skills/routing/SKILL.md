---
name: routing
description: 複数ファイル・複数手順・調査を伴うタスクの着手時、委譲の直前、同じ tool 呼び出しを繰り返した時、作業の成功条件や検証方法が曖昧な時に発動。成功条件を固定し、決定的な道具・直接実行・scoped delegation を費用対効果で選び、証拠付きの出力契約を適用する。1 行修正や既存パターン追従の単発編集では発動しない。
---

# Routing（分解と実行方法の選択）

目的は、最少の context と往復で検証可能な outcome を得ること。OpenAI / Codex を primary harness とするが、特定 model の序列を workflow に埋め込まない。provider や model は、必要な能力・可用性・privacy・費用をその時点で比較して選ぶ。

## When to Use

以下の状況で発動:

- 複数ファイル・複数手順・調査を伴うタスクに着手する時
- subagent、別 session、外部リサーチへ作業を渡す直前
- issue を受け取り、成功条件・対象範囲・検証方法を具体化する時
- 同じ種類の tool 呼び出しを 3 回以上繰り返していると気づいた時
- task の分解や委譲が、実行そのものより高くなりそうな時
- 委譲先の報告を受け取り、次の作業や完了判定を決める時

## 手順

1. **成功条件を先に書く**。ユーザーが確認できる結果、触る範囲、pass すべき検証、外部 state 変更の有無を 1〜5 行で固定する。issue / PR があればそこへ残す
2. **事実と仮説を分ける**。repo / docs / issue / command output で確認した事実には path や出力を添える。原因・効果・前提が未実測なら「仮説」と書き、安く検証できるものは分解前に確認する
3. **候補を順に比較する**
   - 既存 script / CLI / test だけで閉じる
   - 担当 agent が同じ context で直接完了する
   - bounded subtask を scoped delegation する
   - 別 provider の独立反証や外部リサーチを追加する
4. **委譲の採算を判定する**。次のすべてが yes の時だけ委譲する
   - 他の作業と独立して進められる
   - allowed path と禁止事項を短く指定できる
   - 成功条件と出力を親が独立検証できる
   - context の受け渡し・待ち・統合の費用より、並列性または専門性の便益が大きい
5. **出力契約を渡す**。下記 template に従い、model 名より能力要件を先に書く。runtime が model 明示を必要とする場合だけ、利用可能な中から条件を満たすものを指定する
6. **outcome を検証する**。diff、検証コマンドの出力、必要なら UI / API / data flow を成功条件と突き合わせる。「passed」「done」という申告だけでは完了にしない
7. **永続 handoff を更新する**。issue / PR に、確認した事実、残る仮説、判断、検証結果、次の一手を書く。会話 transcript だけに状態を残さない

## 実行方法の比較

| 方法               | 適する作業                                                               | 選ぶ条件                                 | 主な検証                              |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------- |
| 決定的な道具       | search、git history、diff、lint、typecheck、test、JSON 変換、CI 状態取得 | 既存 script / CLI が対象を表現できる     | exit code、機械可読出力、対象件数     |
| 直接実行           | context が一体で、小さく分けると往復が増える実装・調査                   | 担当 agent が scope 内で安全に完了できる | diff と end-to-end の成功条件         |
| scoped delegation  | 独立した列挙、調査、実装、検証                                           | bounded scope と出力契約を固定できる     | 親が一次情報と突合                    |
| 別 provider の反証 | auth / RLS / billing / migration / 公開契約などの高リスク変更            | 独立視点の便益が実行コストを上回る       | failure scenario と diff の到達可能性 |

外部 provider の反証は任意であり、可用性を merge gate にしない。OpenAI / Codex で実装した変更に他 provider を使う場合も、その provider へ渡す context と権限を必要最小限にする。

## 決定的な道具の入口

既定出力は判断できる大きさに射影し、失敗を空出力で隠さない。

| 分類             | 入口                                                     | 射影                                          |
| ---------------- | -------------------------------------------------------- | --------------------------------------------- |
| Repository       | `rg -n`、`git diff --stat`、`git log -S`、`git blame -L` | 件数・stat から入り、必要 path だけ読む       |
| Validation       | `pnpm check`、`pnpm typecheck`、`pnpm lint`、対象 test   | 失敗行と末尾を残す                            |
| Context          | `pnpm ctx <issueまたはPR>`                               | 成功条件・関連 path・次の一手に絞る           |
| CI / PR          | `gh pr checks`、`gh run view`、`pnpm trace <PR>`         | `--json` / `--jq` で必要 field だけ読む       |
| External service | repo script、公式 CLI、必要時だけ MCP                    | metadata と対象 1 件へ絞り、secret を出さない |

同じ tool 連鎖が繰り返される場合は script 化の候補にするが、今回だけの短い処理を先回りして恒久化しない。巨大出力は context に入れる前に範囲指定、`--jq`、head / tail で射影する。

## 委譲 prompt の骨格

```text
目的: <ユーザーが確認できる outcome>
成功条件: <受け入れ条件>
確認済みの事実: <path / issue / command output>
未確認の仮説: <無ければ「なし」>
触ってよい path: <scope>
禁止事項・権限: <stage / commit / push / external mutation の可否>
検証: <そのまま実行できるコマンドと確認観点>
最終報告: 変更または所見、根拠、検証出力の要点、未確認事項、deferred scope
```

write 可能な委譲は同一 worktree・非重複 scope に限定する。commit / push / external mutation は、依頼側が明示的に委ねた場合だけ含める。

## 反例

- 成功条件を書かず、先に model や agent 数を決める
- 小さく一体な変更を、並列化できないのに分割する
- 「重要なものを選べ」のように比較基準を渡さず判断を委ねる
- CLI で再現できる集計を、自然言語の要約だけで受け取る
- provider の肩書きや価格だけで task を割り当てる
- 委譲先の報告を一次情報と突き合わせず、そのまま完了報告へ使う

## When NOT to Use

- 1 ファイル 1 行の修正、既存パターン追従の単発編集（`AGENTS.md` §委任・報告の作法で足りる）
- issue を worker へ渡す GitHub 側の手順・ラベル操作（`dispatch` skill の領域）
- merge 前のクロスレビュー（`pr-cross-review` skill の領域）
