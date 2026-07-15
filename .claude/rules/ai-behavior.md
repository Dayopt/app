# AI行動規範

Human–Agent Partnership、権限境界、read-only delegation、writer ownership の正本は `AGENTS.md` とする。本ファイルは、Main がタスクの負荷と進行方法を決めるための補足だけを定義する。

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
