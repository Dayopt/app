---
name: 'source-command-plan-review'
description: '直前の実装 plan を fact-checker と critic で並列レビューする'
---

# source-command-plan-review

Use this skill when the user asks to run the migrated source command `plan-review`.

## Command Template

# Plan レビュー

直前に提示した実装 plan を 2 つの agent に**並列**で渡してレビューさせる。

## 手順

1. **同一メッセージ内に 2 つの `Agent` tool call** を並列発行する:
   - `subagent_type: plan-fact-checker` — plan 全文を verbatim で渡す
   - `subagent_type: plan-critic` — plan 全文を verbatim で渡す

   plan は要約しない。自分のコメント・予断を加えない。

2. 両 agent の結果が揃ったら、user に**統合レポート**を提示する:

   ```
   ## Fact Check
   <plan-fact-checker の出力をそのまま>

   ## Critic
   <plan-critic の出力をそのまま>

   ## 統合判定
   <一文。fact-checker に ✗ または ⚠ があれば critic の verdict に関わらず REVISE 寄せ。critic verdict と組み合わせて最終判定>
   ```

3. user に次のアクションを問う:
   「plan を修正する／このまま進める／議論する」

## 守ること

- agent 出力を**要約・整形しない**（verdict が歪む）
- critic / fact-checker の指摘を勝手に反映しない（次のアクションは user が決める）
- 2 agent は必ず**並列**起動（直列にしない、コスト 2 倍）
- 統合判定の一文以外、自分の意見を足さない
