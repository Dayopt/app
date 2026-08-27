# AI行動規範

協働の関係と判断のテンポ（authority level）の正本は `CLAUDE.md` §協働のかたち。本ファイルはその運用機構 — subagent への委任、writer 境界、報告フォーマット、タスク進行の決め方 — の正本。

## Read-only delegation

Main は次の条件で read-only subagent を自動利用する。許可は求めず、利用理由を短く通知し、結果を Main 自身の判断として統合する。

| Role                 | 自動委任条件                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `architecture-guard` | cross-feature import、barrel / Composition Layer、file move、所有 feature、依存方向を変更する時            |
| `behavior-verifier`  | 現在挙動、公開契約、state transition、query cache、temporal contract、bug regression を変更・検証する時    |
| `risk-reviewer`      | auth、RLS、service role、OAuth、webhook、billing、redirect、migration、`SECURITY DEFINER/INVOKER` を扱う時 |

- 委譲するかは禁止リストではなくコスト判断で決める。Main のコンテキスト（トークン・注意）を節約できるなら小さな作業でも subagent へ委譲してよい。判断はその時点のモデルがその都度の文脈で行う
- 複数作業を指揮するセッションでは、調査・ドラフト執筆・実装（§Writer ownership の範囲で）の委譲を既定とし、Main には判断・統合・diff レビュー、commit、external state の mutation、ユーザーへの報告を残す
- **read-only subagent**（上表の 3 role と `.claude/agents/` の reviewer）は repo / external state を変更せず、write-capable tool / command の試行もしない。Main または user から依頼されても拒否し、nested agent を起動しない。command 実行が必要なら、Main が実行すべき command と確認観点を返す。実装を委譲する write 可能な subagent は §Writer ownership の条件下で別扱いとする
- Main は agent output を採用する前に、根拠を直接確認する

## Writer ownership

- Main を既定の writer とし、read-only subagent は repo / external state を変更しない
- 明示的に起動する purpose-built artifact generator は、対象 scope の唯一の writer としてのみ例外を認める。Main は同じ scope を同時編集せず、生成後の diff をレビューする
- 実装は write 可能な subagent へ委譲してよい。次の 4 条件をすべて満たす場合に限る: (a) Main と同一 worktree、(b) Main が同時編集しない非重複 scope、(c) commit 前に Main が `git diff` をレビュー、(d) commit / push / external state の mutation は Main に残す。狙いは品質境界を下げることではなく、**ファイル内容を subagent の文脈に閉じ、Main には diff だけを入れる**こと。(c) を省いた委譲はこの例外に当たらない
- **並行**する複数 writer（Main と subagent が同時に書く、writer subagent を複数走らせる）は、ユーザーの明示指示、重複しない scope、writer ごとの別 worktree がすべて揃う場合に限る

## 委譲時の model 指定

委譲（`Agent` tool / worker dispatch）では **model を必ず明示する**。省略すると Main と同じ tier が既定で継承され、階層が実運用されない（2026-08-03 実測: haiku は全 output token の 0.2%）。

| Tier             | 担当                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| **Haiku**        | rename、一括置換、ログ蒸留、test 実行と結果要約などの機械的作業        |
| **Sonnet**       | 通常の実装、調査                                                       |
| **Main**（Opus） | 指揮台の判断、統合、diff レビュー、commit、ユーザーへの報告            |
| **Fable**        | メタ把握（問題設定・前提・全体構造を疑う）。常設せず発火条件でのみ使う |

- 迷ったら 1 tier 下から始める。足りずに上げ直す方が、最初から上位 tier を使うより安い
- provider / model 名が変わったら tier の役割定義を正とし、名前を読み替える
- 実際の構成比は SessionStart hook（`.claude/hooks/session-token-usage.py`）が毎回出す。下位 tier の比率が上がらないなら委譲が機能していない
- **Fable は日常のループに置かない**（2026-08-27、[#2451](https://github.com/Dayopt/dayopt/issues/2451)）。指揮台の既定は Opus で、Fable を呼ぶ発火条件と出力の着地先は `.claude/rules/orchestration.md` §メタ把握（User + Fable） が正本
- `.claude/agents/` の agent は frontmatter の `model:` を正とする（未指定継承を禁止）。省略すると呼び出し元と同じ tier が継承され、上表の tiering が実運用されない

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

**User への確認・裁可依頼は「選択肢 + 推奨込み」を既定形式にする**（策定日: 2026-08-12）。`CLAUDE.md` §協働のかたち の「選択肢を丸投げせず証拠付きの推奨まで作る」を確認 UI 面へ適用したもの。

- 推奨を先頭に明示し、各選択肢に一言の根拠を添える
- 複数の独立した判断が同時に発生したら、確認は 1 回に束ねる（往復回数を判断の数に比例させない）
- 例外は自由記述が本質の質問（開いた問い、仮説段階の相談）のみ。この場合も見立て・仮の推奨を添え、白紙で投げない

## Reasoning effort

モデル名やユーザーの magic word ではなく、不確実性、影響範囲、可逆性に合わせて reasoning effort を選ぶ。

| Effort   | 使用ケース                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------ |
| **軽量** | 対象 path が明確な検索、既存 pattern の確認、局所的で可逆な修正                                  |
| **標準** | 通常の実装、bug fix、複数候補の比較、既存 contract の検証                                        |
| **高**   | architecture、security、migration、複数 feature の統合、不可逆または Production-sensitive な判断 |

- reasoning effort を model / provider 名に固定しない（委譲先 model の選び方は §委譲時の model 指定 が定める）
- 高 effort は agent の人数ではなく、一次情報の質と反証の深さに使う

## 曖昧な指示への対応

1. repo、docs、issue、external state から判明する事実は先に調べる
2. 承認済み scope 内で安全かつ可逆なら、合理的な仮定を明示して進める
3. `CHECKPOINT` または `EXPLICIT AUTHORITY` に当たる未決事項だけを、証拠付きの推奨とともにユーザーへ返す
4. 質問、懸念、仮説を指示や承認へ読み替えない

確信度の一律 threshold は使わない。確認要否は `CLAUDE.md` の authority level で決める。

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
