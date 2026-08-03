---
status: frozen
date: 2026-08-01
---

# rollup tracking issue を廃止し、状態はラベルと epic の sub-issues で持つ

## 背景・当時の前提

並行する非 feature 作業の指揮は、2026-07 まで **rollup tracking issue**（初代 #1567、v2 #1788）が担っていた。1 本の issue 本文にレーン定義、凍結リスト、推奨着手順、運用ルール、進捗チェックリストをまとめ、そこを読めば全体を俯瞰できる形である。

この方式は本文の手更新に依存する。一方で、各 issue は open / closed と `status:*` ラベルという状態をすでに持っている。同じ状態が 2 箇所にあり、rollup 側だけが手で書き換わらない限り古くなる。実際 #1788 の本文は、close 時点で「security 完了 5 件」「external-calendar 残り」といった、個別 issue を見れば分かる情報を抱えていた。

## 決定と理由

- **rollup tracking issue を廃止する。** #1788 を close し、**後継 rollup は作らない**
- 状態は **issue 自身**が持つ。open / closed に加えて `status:ready` / `status:in-progress` / `status:review` / `status:blocked` / `status:watching` のラベルが着手可否を表す
- 大きなテーマは `scope:epic` の issue が **sub-issues** で束ねる
- 全体俯瞰は 1 本の issue を読むのではなく、`scope:epic` 一覧 + `status:*` クエリで**都度組み立てる**
- 凍結は `status:blocked` ラベルのみで判定する。別置きの凍結リストを持たない

理由は二重管理の解消にある。issue の open / closed と PR リンクは操作の副作用として勝手に最新化されるが、rollup 本文は誰かが書き換えないと古くなる。状態を「勝手に最新化される側」へ寄せる。これは [workflow.md §issue と docs の分担](../../../.claude/rules/workflow.md) が docs と issue の間で引いた線を、issue の内部にも適用したものにあたる。

## 却下した選択肢と、なぜ捨てたか

- **rollup を残して更新頻度を上げる案** — 更新が人間の規律に依存する点が変わらない。二重管理そのものを消さないと同じ陳腐化が再発する
- **GitHub Projects のボードへ移す案** — 状態の置き場が増えるだけで、ラベルとの二重管理になる。個人開発の規模でボードの運用コストに見合わない
- **後継 rollup を軽量版で作り直す案** — 「軽量」の線引きが運用中に崩れ、元の rollup へ戻る。作らないことで線引きの判断自体を消す

## 影響・やること

#1788 本文に残っていた項目の受け皿:

| 本文の項目             | 受け皿                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 未実施 sweep 6 項目    | #1792（chore issue として切り出し）                                                                                     |
| security 完了 5 件     | close 済み（PR #1790 / #1791）                                                                                          |
| external-calendar 残り | epic #1702 の sub-issues（#1708 / #1709 / #1710）                                                                       |
| billing 施策           | epic #1669 の sub-issues（#1336 / #1483 / #1428）                                                                       |
| その他の単独 issue     | 各 issue 自身 + `status:*` ラベル                                                                                       |
| 凍結リスト             | 該当なし（close 時点で `status:blocked` の issue ゼロを確認済み）                                                       |
| 運用ルール 6 項目      | `.claude/skills/dispatch/SKILL.md` / [workflow.md](../../../.claude/rules/workflow.md) に既存記載（重複のため転記なし） |

- `dispatch` skill の rollup 前提の記述をラベル + epic 方式へ差し替える（#1806 で実施）
- 以後、状態を docs や skill 本文へ転記しない。skill は手順、issue とラベルが状態という分担を保つ
