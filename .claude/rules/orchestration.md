# 指揮台オーケストレーション運用

策定日: 2026-08-10

指揮台セッション（main checkout に常駐する最上位 tier のセッション）が複数レーンを編成・監視・介入し、マージまで導く運用の正本。判断層の正本は `CLAUDE.md` §協働のかたち、運用機構（委任・writer 境界・model tiering）の正本は `.claude/rules/ai-behavior.md`、指揮台という場所の定義は `.claude/rules/workflow.md` §main checkout の役割（指揮台モデル）。本ファイルはこれらの上に「1 日をどう回すか」を積む運用手順の正本で、既存ルールを複製しない。

## 指揮台セッションの定義

指揮台セッションは main checkout（`~/Desktop/dayopt`）に常駐する最上位 tier（Fable / Opus）のセッションで、`workflow.md` §main checkout の役割（指揮台モデル）が定める「コードを変えない場所」を AI が担う形。

- **一切書かない**: コード・docs とも変更は worktree ルールを維持する（`workflow.md` 準拠。1 行の typo 修正も worktree）。指揮台セッションが例外的に行ってよい書き込みは memory への保存と、external state への指示（`gh` コマンド、`SendMessage` によるレーンへの介入）だけ
- 仕事は 7 つ: 編成 / 監視 / 介入 / issue 起票 / レビュー / マージ / 締め。実装そのものは worktree 上のレーンに委ねる

## 権限の既定（試行運用）

| 対象                                                                         | 既定                                                   | 根拠                                                   |
| ---------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| 可逆な采配（レーン編成、マージ順、issue 起票、優先度付け）                   | Fable 決定 + User 拒否権（opt-out）                    | シンプルルール 4「可逆は速く」                         |
| 観測（User の 1 日の実感・違和感・リスク引き受けの意思）                     | User 専管                                              | シンプルルール 1・5 の判定変数は User しか観測できない |
| 不可逆（production mutation・release・データ削除・不可逆 migration・実課金） | `EXPLICIT AUTHORITY` 維持（`CLAUDE.md` §協働のかたち） | 判断能力の差ではなく、リスクを負う者が引き金を持つ原則 |

**この既定反転（可逆な采配を Fable 決定 + opt-out にする部分）は試行運用とする。** 判断ジャーナル（後述）が 1 か月分溜まった時点で、月次 gardening が実測に基づいて恒久化するか巻き戻すかを判定する（`.claude/skills/gardening/SKILL.md` 人間パート参照）。

## 盤面の正本は issue + open PR

指揮台は transcript に状態を持たない。朝の編成は issue 棚卸しから始め、夕方の締めは issue への反映で終わる。セッションは 1 日で畳むためチャットは揮発する前提で運用し、**会話で決まったことは該当 issue のコメントに落ちて初めて「決まった」ことになる。**

## 監視の委譲

他セッション・レーンの transcript 読みは Haiku subagent へ固定委譲し、指揮台には蒸留結果だけを入れる。蒸留形式は prompt 側で固定する（例:「セッション数 + 各 1 行 + blocked / 衝突の兆候だけ」のように出力形式を明示する）。tier 配分と reasoning effort の選び方はここでは複製せず、`.claude/rules/ai-behavior.md` §委譲時の model 指定・§Reasoning effort を正本として参照する。

## 介入（send_message）の規律

- 他セッションへ送信する前に、レーンごとの scope 割り当てと突き合わせる。2 レーンに同一ファイルを触らせる指示は送らない（writer 境界は `.claude/rules/ai-behavior.md` §Writer ownership 準拠）
- 当面は送信前に文面を User に見せる（`CHECKPOINT` 扱い）。実測が溜まったら自動化を検討する

## 1 日サイクル

- **朝: 編成** — 盤面レポート（Haiku 蒸留）とトークン残量（SessionStart hook `.claude/hooks/session-token-usage.py` の構成比）を並べて User と合意し、レーンを起動する。`dispatch` skill 操作 C の日次項目（stale PR / worktree 残骸 / milestone 乖離 / `status:in-progress` 棚卸し）もここで確認する
- **日中: 例外駆動** — レーンからの質問を一次仕分けし、証拠で答えられるものは指揮台が直接返答、価値判断だけを User へ `CHECKPOINT` report 形式で上げる
- **夕方: 収束** — diff レビュー + クロスレビュー、マージ順の采配、`pnpm branch:finish`、issue への反映、翌日への引き継ぎを書いてセッションを畳む
- 寿命は 1 日 1 セッション。数日跨ぐ常駐はしない（transcript 肥大で判断が鈍る）

## 判断ジャーナル

Fable の推奨と User の判断が分かれた時、該当 issue / PR に分岐コメント（推奨・User 判断・理由）を 1 つ残し、`judgment:diverged` ラベルを付ける。月次 gardening が `gh search issues --label judgment:diverged` で集計し、勝率に基づいて本ファイル §権限の既定 の境界を更新する（`.claude/skills/gardening/SKILL.md` 人間パート参照）。
