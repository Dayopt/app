# 競合調査: TickTick

> アーカイブ元: GitHub Issue #1267（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

TickTick は、ToDoリスト・カレンダー・ポモドーロ・習慣管理・統計・リマインダー・コラボレーションをまとめた all-in-one productivity app。
Dayopt とは「カレンダー上で予定を組む」「時間を追跡する」「統計で振り返る」という領域で重なる。

ただし、TickTick はかなり **Task-first / All-in-one**。Dayoptはこの方向に寄せると劣化版になりやすい。
むしろ、Dayoptが「Todoではなく時間」「習慣やタスクではなく予定/実績差分」に集中すべきことを確認するための競合として見る。

- 公式サイト: https://ticktick.com/
- Premium: https://ticktick.com/about/upgrade
- Help Center: https://help.ticktick.com/
- Integrations: https://ticktick.com/integrations
- Download: https://ticktick.com/about/download

## 競合分類

| 観点           | 評価                                                                  |
| -------------- | --------------------------------------------------------------------- |
| 機能競合       | 中〜高。calendar / pomo / statistics / habit / task management を持つ |
| コンセプト競合 | 中。DayoptよりTodo/習慣/リマインダー色が強い                          |
| ターゲット競合 | 高い。一般個人、学生、ビジネスユーザー、習慣管理ユーザーまで広い      |
| 価格競合       | 高い。Annual $35.99 と低価格                                          |
| UX思想         | Task-first + All-in-one。Dayoptとは思想がかなり違う                   |

## 公式上の主な訴求

- “A To-Do List and Calendar to keep you organized”
- To-Do List
- Calendar Views
- Pomodoro
- Habit Tracker
- Countdown
- Kanban
- Timeline
- Eisenhower Matrix
- Sticky Note
- Constant Reminder
- Repeat Reminder
- NLP
- Filter
- Keyboard Shortcuts
- Collaboration
- Integration
- Statistics
- Theme
- Sync across all platforms

公式サイトでは、ToDo、カレンダー、ポモドーロ、習慣管理、統計などを「生活と仕事全体を整理する」方向で訴求している。

## 価格

2026-06-07時点の公式 Premium ページでは以下。

| Plan           |        価格 | 備考               |
| -------------- | ----------: | ------------------ |
| Free           |        Free | 基本機能           |
| Premium Annual | $35.99/year | less than $3/month |

Premiumでは、full calendar functionality、custom filters、履歴・統計、estimated Pomo、calendar widgets、premium themes、white noises などが使える。
Dayoptの $5 Pro 想定より安く、価格競合としては強い。

## 主な機能

### To-Do List / Task Management

TickTickの中心はToDoリスト。
work projects / personal tasks / study plans などを整理し、期限・リマインダー・繰り返し・チェックリスト・優先度などで管理する。

Dayoptではここを真似ない。
Todo管理はGitHub Issuesや他のツールに任せ、Dayoptは時間ブロックと実績差分に集中する。

### Calendar Views

TickTickは yearly / monthly / weekly / daily / agenda / multi-day / multi-week など複数のカレンダービューを持つ。
週表示では busy and free time blocks を見られる。

Dayoptとの重なりはあるが、DayoptはモバイルDay表示を中心に、PCでも「予定と実績が同じブロックで見える」ことに集中した方がよい。

### Pomodoro / Estimated Pomo

TickTickはPomodoroを標準機能として持ち、Premiumではタスクごとに estimated Pomo を設定して時間消費を計算できる。

Dayoptではポモドーロ自体は核ではない。
盗むなら「見積もりと実績を軽く比較する」部分だけ。

### Habit Tracker

TickTickは習慣管理も強い。
習慣ライブラリ、柔軟なトラッキング、統計を持つ。

Dayoptは習慣管理に寄せない方がよい。
タグごとの時間実績が結果的に習慣のように見える程度で十分。

### Statistics

TickTickは tasks / focus duration / habit logs を統計で見られる。
DayoptのReviewと近いが、Dayoptは「統計を増やす」のではなく「予定/実績/差分を見る」に絞る。

### Keyboard Shortcuts / NLP

TickTickは keyboard shortcuts と command menus、自然言語入力を持つ。
Dayoptでもここは参考になる。

Dayoptでは自然言語より、タグ選択・時間操作・開始/停止・確定のショートカットを優先したい。

## Dayoptとの違い

```text
TickTick:
タスクを作る
↓
リスト/カレンダー/習慣/ポモドーロで管理する
↓
リマインダーで実行を促す
↓
統計で進捗を見る
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

TickTick は **Task-first / Reminder-first / Habit-first / All-in-one**。
Dayopt は **Timebox / Tag-first / Planned-Actual-first / Minimal-first**。

TickTickは広く強いが、Dayoptが勝つ場所は「全部管理しない」「時間のズレだけを見る」こと。

## 盗めそうな部分

### P1: 低価格でも多機能に見える価格設計の参考

TickTick Premium は年 $35.99 とかなり安い。
Dayoptが $5/月なら、機能量では勝てない。
そのため、LPでは「機能数」ではなく「軽さ・時間ブロック・予定実績差分」に絞る必要がある。

Dayopt訳:

```text
全部入りではなく、今日の時間だけを整える。
```

### P1: Calendar上のbusy/free time blocks

TickTickの週表示は busy/free time blocks を見せる。
DayoptのReviewでも、空白時間・差分・未配置時間の見せ方に応用できる。

例:

```text
今日の空白
- 10:30–11:00 30分
- 15:00–15:45 45分
```

### P1: Keyboard shortcuts / command menus

Dayoptでもショートカットは重要。

候補:

```text
T: タグ選択
Enter: 確定
Space: 記録開始/停止
R: Review
1-9: 最近使ったタグ
```

### P2: Statistics を「進捗」ではなく「補正」に翻訳する

TickTickは tasks/focus/habit の進捗統計。
Dayoptは planned/actual/diff の補正情報。

Dayopt訳:

```text
がんばりを測るのではなく、ズレを次の計画に戻す。
```

### P2: Cross-platform sync の安心感

TickTickはスマホ・PC・タブレット・Watchまで同期できることを強く訴求している。
DayoptもPWA firstでよいが、「どこからでも軽く触れる」は価値として言語化したい。

## 盗まない方がいい部分

| 機能/思想             | 理由                        |
| --------------------- | --------------------------- |
| ToDo管理全般          | GitHub Issues等と役割が被る |
| Constant Reminder     | 通知削除方針と衝突          |
| Repeat Reminder       | 繰り返し削除方針と衝突      |
| Pomodoro              | Dayoptの核ではない          |
| Habit Tracker         | 別プロダクト化する          |
| Kanban                | タスク管理に寄りすぎる      |
| Eisenhower Matrix     | 優先度管理に寄りすぎる      |
| Collaboration         | 初期ターゲットではない      |
| Theme多数             | 初期価値ではない            |
| Checklist/subtask強化 | 複雑化する                  |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
ToDoリストも習慣もポモドーロも全部管理
リマインダーでタスクを忘れない
生産性オールインワン
```

使いたい表現:

```text
Todoではなく、時間を整える
通知で追い立てず、予定と実績のズレを見る
タグを置くだけで、今日の時間が形になる
統計ではなく、次の計画のための差分
```

## Dayoptへの示唆

TickTickは、機能量・価格・対応プラットフォームで非常に強い。
Dayoptは「機能数」では勝てない。
勝ち筋は、明確に **やらないことを決める** こと。

```text
TickTick = ToDo / カレンダー / ポモドーロ / 習慣 / 統計をまとめる all-in-one app
Dayopt = タグを時間に置き、予定と実績の差分で明日を補正する timebox tool
```

DayoptはTickTickから、busy/free blocks、keyboard shortcuts、低価格競合としての見せ方を学ぶ。
ただし、ToDo、通知、習慣、ポモドーロ、Kanbanは盗まない。

## 次に検討したいこと

- [ ] LPで「全部入りではない」ことを価値として言語化する
- [ ] Reviewで空白時間 / busy-free 的な表示を検討する
- [ ] ショートカット初期セットを決める
- [ ] 通知/繰り返し/習慣/ポモドーロは非採用方針として明文化する
- [ ] Dayopt Pro $5 の価値を「機能量」ではなく「核心UX/MCP/API」に寄せる
