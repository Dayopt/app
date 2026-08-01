---
description: 直前の実装 plan を fact-checker と critic で並列レビューし、Main が証拠を統合する
---

# Plan レビュー

直前に提示した実装 plan を `plan-fact-checker` と `plan-critic` へ並列委任し、Main が検証可能な事実と技術判断を統合する。agent の投票や raw output を user の判断材料として丸投げしない。

## 手順

1. 同一メッセージ内で 2 agent を並列起動する。
   - `plan-fact-checker`: plan 全文を verbatim で渡す
   - `plan-critic`: plan 全文を verbatim で渡す
2. Main が両結果の根拠を確認し、次の順で統合する。
   - 誤った path / symbol / table / API / 件数は plan 内で訂正する
   - correctness、security、irreversibility、scope の指摘は一次情報と照合し、妥当なら plan に反映する
   - agent 間の不一致は多数決にせず、code / docs / test / external state の証拠で解決する
   - 実行を伴う確認が必要なら、read-only agent が返した command を Main が実行する
3. 修正が plan の前提または approach を変えた場合は、修正版を再レビューする。局所的な事実訂正だけなら Main の再確認でよい。
4. 未解決事項を authority level で分類する。
   - `AUTONOMOUS`: Main が推奨を採用して plan を完成させる
   - `CHECKPOINT` / `EXPLICIT AUTHORITY`: `.claude/rules/ai-behavior.md` の checkpoint report を作り、必要な価値判断または権限だけを user に求める
5. user decision が不要なら、統合済みの完成 plan を提示する。

## 出力

```markdown
## Fact verification

- 訂正・確認した事実と根拠

## Technical review

- 採用した指摘、退けた指摘と根拠

## Main recommendation

- 統合済みの推奨と次の action

## User decision required

- CHECKPOINT / EXPLICIT AUTHORITY がある場合だけ記載
```

## 守ること

- 2 agent は必ず並列起動する
- plan は要約せず、同一内容を両 agent へ渡す
- agent の一致自体を evidence として扱わない
- 技術的に解決できる指摘を user の選択問題へ変換しない
- agent の finding を無検証で採用しない
