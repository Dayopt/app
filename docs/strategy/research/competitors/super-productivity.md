# 競合調査: Super Productivity

> アーカイブ元: GitHub Issue #1262（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Super Productivity は、タスク管理・時間記録・集中支援を統合したオープンソースの生産性アプリ。
Dayopt とは「予定を立てる → 実績を記録する → 振り返る」というループが重なるため、広義の競合として継続観察したい。

- 公式サイト: https://super-productivity.com/
- Web App: https://app.super-productivity.com/
- GitHub: https://github.com/super-productivity/super-productivity
- Pricing: https://super-productivity.com/pricing/
- Schedule Planner: https://super-productivity.com/use-cases/schedule-planner/
- Time Tracker: https://super-productivity.com/use-cases/time-tracker/
- Integrations: https://super-productivity.com/integrations/
- Privacy / Local-first: https://super-productivity.com/use-cases/privacy-productivity/

## 競合分類

| 観点           | 評価                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 機能競合       | 高い。タスク、タイムトラッキング、スケジュール、振り返りを持つ                    |
| コンセプト競合 | 中〜高。計画・実行・実績・改善のループが近い                                      |
| ターゲット競合 | 高い。開発者、フリーランス、集中作業ユーザーに強い                                |
| 価格競合       | 高い。完全無料・OSS・ローカルファースト                                           |
| UX思想         | Dayoptとは異なる。Super Productivity は Task-first / Dayopt は Timebox・Tag-first |

## 公式上の主な訴求

- “Tasks, time tracking, and focus tools in one open-source app”
- Offline / private / local-first
- No account required
- 100% free / no premium tiers / no hidden costs
- GitHub / GitLab / Jira / Gitea / Google Calendar / CalDAV などとの連携
- JSON / CSV export
- Keyboard-first design
- One-click time tracking
- Pomodoro / Focus mode
- Kanban / Eisenhower / custom boards
- Repeating tasks
- Work logging / metrics / reports

## 主な機能

### Task Management

- quick add
- subtasks
- notes
- due dates
- projects / folders / tags
- custom views
- Kanban
- Eisenhower matrix
- compact list

Dayopt ではここを真似すぎると Todo 管理アプリになるため注意。

### Schedule Planner

公式説明では、タスク一覧を visual timeline に変換し、タスクを時間枠へドラッグして日次スケジュールを作る。

- タスクを作成、または Jira / GitHub / GitLab から import
- time estimate を設定
- daily timeline にドラッグ
- 過負荷の警告
- タスクごとに timer start
- 実行中に予定がズレたら残りを再調整
- planned / finished / remaining capacity を一覧できる

Dayoptとの重なりが一番強い領域。

### Time Tracking

- task / subtask から timer start / pause
- notes / checklists / tracked time が同じ場所にまとまる
- daily / weekly summaries
- CSV / JSON / plain-text export
- plan vs actual insights
- estimates と実績を比較して次回計画に活かす

Dayoptの Review とかなり近い。
ただし Super Productivity はタスク単位、Dayopt は時間ブロック・タグ単位で差別化できる。

### Integrations

- Jira Cloud / Data Center
- GitHub Issues & PRs
- GitLab Issues & Time
- Google Calendar
- CalDAV
- Gitea / Forgejo
- Plugin system / REST API

特徴は、アプリが各サービス API を直接呼ぶ local-first 型。
認証トークンはローカル保存、middleware server を挟まないと説明している。

Dayoptでは GitHub Issue import を真似るより、URL添付 / MCP / API-first で「外部タスク管理は奪わない」方が合いそう。

### Privacy / Local-first

- no forced account
- no telemetry
- no analytics
- no subscription
- local storage
- optional encrypted sync
- Dropbox / Drive / WebDAV sync
- data export
- open source / auditable

Dayoptはクラウド/PWA/API-firstなので同じ主張はできないが、「データを閉じ込めない」「CSV export」「いつでも取り出せる」は盗める。

## Dayoptとの違い

```text
Super Productivity:
タスクがある
↓
見積もる
↓
スケジュールに置く
↓
タイマーで実行する
↓
ログを見る
```

```text
Dayopt:
時間枠がある
↓
タグを置く
↓
予定と実績が1つのエントリになる
↓
ズレを見る
↓
次の時間設計に戻る
```

Super Productivity は Task-first。
Dayopt は Timebox / Tag-first。

この違いを崩さないことが重要。

## 盗めそうな部分

### P1: 「Today / 今日」に集約する思想

Super Productivity は calendar というより daily planner として見せている。
Dayoptも「カレンダーアプリ」ではなく「今日の時間を整える場所」として打ち出すと強い。

Dayopt訳:

```text
今日、何に時間を使うかを先に置く。
終わったら、予定と実績のズレだけを見る。
```

### P1: 1タップ記録 / One-click Time Tracking

Super Productivity は task から timer を開始する。
Dayoptでは task ではなく tag を起点にする。

Dayopt訳:

```text
タグを押す
↓
今からそのタグの記録が始まる
```

これは Dayopt の「軽い・早い・少ない」と相性が良い。

### P1: planned vs actual の見せ方

Super Productivity は estimates と actual を比較し、次の計画精度向上に使う。
Dayoptの Review はここをさらに尖らせる。

例:

```text
Work
予定 ████████ 2h
実績 ██████   1h30m
差分 -30m
```

または:

```text
今日のズレ
- Work: 30分短い
- SNS: 20分増えた
- 空白: 40分
```

重要なのは「反省」ではなく「補正」として見せること。

### P2: Keyboard-first

開発者向けならかなり盗める。

候補:

```text
Enter: 確定
Space: 開始/停止
J/K: 前後移動
数字: 最近使ったタグを選択
Esc: 閉じる
```

### P2: CSV export / data ownership

時間記録は蓄積データなので、閉じ込め不安が出やすい。
FreeでもCSV exportを入れると信頼につながる。

Dayopt訳:

```text
入力した時間データを閉じ込めません。
```

### P3: URL / Link 添付

GitHub Issue import ではなく、GitHub Issue / PR / Claude / Codex / Slack ログなどのURLを貼れる程度でよさそう。

Dayoptは外部ツールを奪わず、使った時間の器になる。

## 盗まない方がいい部分

| 機能                         | 理由                                          |
| ---------------------------- | --------------------------------------------- |
| Kanban                       | タスク管理に寄りすぎる                        |
| Subtask / Checklist          | 複雑化する                                    |
| Pomodoro                     | Dayoptの核ではない。必要なら外部でよい        |
| Repeating tasks              | 削る方針と衝突                                |
| GitHub/Jira issue import     | Todo管理アプリ化する                          |
| Project / Folder 多階層      | Dayoptはタグ階層で十分                        |
| 高度なレポート               | Reviewが重くなる                              |
| Procrastination helper / CBT | 別プロダクト感が強い                          |
| Plugin system                | 初期には過剰。MCP/API-firstの方がDayoptらしい |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
タスク管理
生産性オールインワン
Pomodoro
プロジェクト管理
GitHub/Jira連携
作業効率化ツール
```

使いたい表現:

```text
予定と実績を、1つの時間ブロックで見る
今日の時間の使い方を軽く整える
Todoではなく、時間を管理する
計画倒れを責めず、ズレを次の計画に戻す
タグを選ぶだけで、予定と記録が残る
```

## Dayoptへの示唆

Super Productivity は「全部できる」競合。
Dayoptはその逆で、「これしかできないけど、それが一番気持ちいい」に寄せるべき。

Dayoptの核:

```text
1. タグを選ぶ
2. 時間に置く
3. 実績にする
4. 差分を見る
5. 次の計画が少し良くなる
```

一言で言うと:

```text
Super Productivity = タスクを片付けるための作業OS
Dayopt = 今日の時間を整えるためのタイムボックスOS
```

## 次に検討したいこと

- [ ] DayoptのLPで「Todoではなく時間」を明確に打ち出すか検討
- [ ] Reviewで planned / actual / diff の最小表示パターンを作る
- [ ] タグ1タップ記録の仕様を整理する
- [ ] キーボードショートカットの初期セットを決める
- [ ] CSV export を Free に含めるか検討
- [ ] 外部URL添付を Entry に持たせるか検討
- [ ] GitHub/Jira import は非採用方針として明文化するか検討
