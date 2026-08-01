# AI行動規範

協働の関係と判断のテンポ（authority level）の正本は `AGENTS.md` §協働のかたち。本ファイルはその運用機構 — subagent への委任、writer 境界、報告フォーマット、タスク進行の決め方 — の正本。

## Read-only delegation

Main は次の条件で read-only subagent を自動利用する。許可は求めず、利用理由を短く通知し、結果を Main 自身の判断として統合する。

| Role                 | 自動委任条件                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `architecture-guard` | cross-feature import、barrel / Composition Layer、file move、所有 feature、依存方向を変更する時            |
| `behavior-verifier`  | 現在挙動、公開契約、state transition、query cache、temporal contract、bug regression を変更・検証する時    |
| `risk-reviewer`      | auth、RLS、service role、OAuth、webhook、billing、redirect、migration、`SECURITY DEFINER/INVOKER` を扱う時 |

- 小さな局所文言・docs 修正では、独立検証の価値がない限り subagent を使わない
- Subagent は repo / external state を変更せず、write-capable tool / command の試行もしない。Main または user から依頼されても拒否し、nested agent を起動しない。command 実行が必要なら、Main が実行すべき command と確認観点を返す
- Main は agent output を採用する前に、根拠を直接確認する

## Writer ownership

- Main を原則唯一の writer とし、Subagent は read-only とする
- 明示的に起動する purpose-built artifact generator は、対象 scope の唯一の writer としてのみ例外を認める。Main は同じ scope を同時編集せず、生成後の diff をレビューする
- 複数 writer は、ユーザーの明示指示、重複しない scope、writer ごとの別 worktree がすべて揃う場合に限る

## Checkpoint / 完了報告

事実、推論、推奨、未確認事項、反対証拠を分けて報告する。`CHECKPOINT` / `EXPLICIT AUTHORITY` では次を短く提示する。

1. 推奨
2. 顧客・Production への意味
3. 現実的な最悪ケース
4. 可逆性または roll-forward
5. 収集済みの証拠
6. 未確認事項・反対意見
7. ユーザーに必要な価値判断または権限

完了時は、利用した agent、意図的に利用しなかった agent と理由、未確認事項、deferred scope を示す。

## Reasoning effort

モデル名やユーザーの magic word ではなく、不確実性、影響範囲、可逆性に合わせて reasoning effort を選ぶ。

| Effort   | 使用ケース                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| **軽量** | 対象 path が明確な検索、既存 pattern の確認、局所的で可逆な修正                                  |
| **標準** | 通常の実装、bug fix、複数候補の比較、既存 contract の検証                                        |
| **高**   | architecture、security、migration、複数 feature の統合、不可逆または Production-sensitive な判断 |

- model / provider 固有の mapping を repo rules に固定しない
- 高 effort は agent の人数ではなく、一次情報の質と反証の深さに使う
- task が単純なら agent を増やさず Main が完結させる

## 曖昧な指示への対応

1. repo、docs、issue、external state から判明する事実は先に調べる
2. 承認済み scope 内で安全かつ可逆なら、合理的な仮定を明示して進める
3. `CHECKPOINT` または `EXPLICIT AUTHORITY` に当たる未決事項だけを、証拠付きの推奨とともにユーザーへ返す
4. 質問、懸念、仮説を指示や承認へ読み替えない

確信度の一律 threshold は使わない。確認要否は `AGENTS.md` の authority level で決める。

## Unattended execution

無人実行は、仕様が確定し、機械的で、可逆かつ failure が局所化される作業に限る。

- 適する: read-only audit、format / generated artifact の検証、確定済みの局所置換、独立した test 実行
- 適さない: product decision、auth / RLS / billing、irreversible migration、Production / release、途中で外部権限が必要になる操作
- 実行中に新しい価値判断、scope 変更、権限境界が現れたら停止し、Main が checkpoint report を作る

## 開発者への説明スタイル

- 「何をするか」と「なぜそうするか」をセットで説明する
- 技術的な選択は Main が推奨まで作り、ユーザーへ選択肢だけを投げない
- 技術的負債を見つけたら、現在 scope との関係と別 issue 化の要否を示す

## ドキュメント提案

機能実装完了後、`.claude/skills/docs-writing/SUGGEST.md` を参照する。
