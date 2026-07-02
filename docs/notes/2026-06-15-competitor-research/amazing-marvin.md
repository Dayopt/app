# 競合調査: Amazing Marvin

> アーカイブ元: GitHub Issue #1268（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Amazing Marvin は、ADHD / procrastination / overwhelm に強く寄せた、非常にカスタマイズ性の高い personal productivity app。
Dayopt とは「day planning」「calendar view」「time blocking」「time tracking」「time estimates」「analytics」などの領域で重なる。

ただし、Amazing Marvin は **Task-first + Workflow customization-first**。Dayoptがこの方向へ寄せると、機能数・設定数・ワークフロー自由度で勝つのは難しい。
むしろ、Dayoptが「設定を増やさず、時間ブロックと予定/実績差分だけに絞る」理由を明確にするための競合として見る。

- 公式サイト: https://amazingmarvin.com/
- Pricing: https://amazingmarvin.com/pricing/
- Help Center: https://help.amazingmarvin.com/en/
- Feature Overview: https://amazingmarvin.com/features
- Day Planning: https://amazingmarvin.com/features/day-planning
- Time Tracking: https://amazingmarvin.com/features/time-tracking
- Time Estimates: https://amazingmarvin.com/features/time-estimates

## 競合分類

| 観点           | 評価                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| 機能競合       | 高い。day planning / calendar / time blocking / time tracking / time estimates を持つ |
| コンセプト競合 | 中。Dayoptよりタスク管理・行動支援・ADHD支援色が強い                                  |
| ターゲット競合 | 中〜高。ADHD傾向、procrastination、個人 productivity ユーザーに強い                   |
| 価格競合       | 中。年間 $96、月換算 $8。Free plan はなし、14日trial                                  |
| UX思想         | Task-first + Customizable workflow。Dayoptとは思想が違う                              |

## 公式上の主な訴求

- “The to-do app that works with your brain, not against it.”
- Built for ADHD minds
- customizable / 100+ features
- To-do lists, day planner, calendar, habits, goals, and more
- Super Focus Mode
- Accountability Pledge
- Task Jar
- Spotlight
- Day Planning
- Pomodoro Timer
- Time Tracking
- Procrastination Wizard
- Color coding / gamification / time estimates / recurring tasks / work sessions
- 300+ customizable settings
- Multiple layout options: list / calendar / kanban
- Enable/disable any feature
- Import from Todoist, TickTick, Things 3, Microsoft ToDo, OmniFocus, Asana, ClickUp, Google Calendar, Sunsama, CSV など

## 価格

2026-06-07時点の公式 pricing 表記では以下。

| Plan              |  価格 | 備考                                          |
| ----------------- | ----: | --------------------------------------------- |
| Marvin Pro Annual | $8/月 | billed as $96/year                            |
| Free Trial        |  14日 | no credit card required                       |
| Free Plan         |  なし | cost barrier がある場合は相談可能との説明あり |

公式 pricing では “One plan. Everything included. No feature gates or upsells.” と説明している。
Dayoptの $5 Pro 想定よりやや高いが、機能量は非常に多い。

## 主な機能

### Day Planning / Calendar / Time Blocking

Amazing Marvin は、1日の計画を minute-level schedule から simple today list まで柔軟に作れる。
公式では Day Planning の workflow に以下を含めている。

- Calendar view
- Time blocking
- Daily schedules
- Capacity estimator

Dayoptとの重なり:

```text
タスクを選ぶ
↓
今日の予定に入れる
↓
カレンダー/タイムブロックで見る
↓
実行する
```

Dayoptでは task ではなく tag / entry を直接置くことで、より軽くする。

### Time Tracking / Time Estimates

Amazing Marvin は、各タスクにどれだけ時間を使ったかを tracking できる。
また、time estimates を持ち、予定時間・見積もりと実績の比較に近い体験ができる。

Dayoptの planned / actual と近いが、Marvinはtaskごとの productivity pattern / billing / reporting 寄り。
Dayoptは「予定と実績が1つの時間ブロックに閉じる」ことを核にする。

### Super Focus Mode / Spotlight / Task Jar

Amazing Marvinは、行動開始の難しさや分析麻痺に対して多くの支援機能を持つ。

- Super Focus Mode: 1つのタスクだけを見る
- Spotlight: 1〜3時間の作業セッションを作る
- Task Jar: ランダムに次のタスクを選ぶ
- Procrastination Wizard: タスク着手をステップで支援する

Dayoptではここをそのまま入れない。
ただし「今見るものを1つに絞る」「今日の時間だけに集中する」という考え方は参考になる。

### Custom Workflows / Feature Toggles

Amazing Marvinの最大の特徴は、100+ features / 300+ settings / enable-disable any feature という極端なカスタマイズ性。

Dayoptではこれは逆方向。
設定や戦略を増やさず、最初から意見のある設計にした方がよい。

### Gamification / Accountability

Gamification、Accountability Pledge、Habits、Goals なども持つ。
Dayoptの核ではない。
タグごとの時間実績が結果的に習慣のように見える程度で十分。

## Dayoptとの違い

```text
Amazing Marvin:
大量のタスクを管理する
↓
自分に合うworkflow/strategyを選ぶ
↓
日次計画・focus mode・time trackingで実行支援する
↓
analyticsやgamificationで改善する
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

Amazing Marvin は **Task-first / Strategy-first / Customization-first**。
Dayopt は **Timebox / Tag-first / Minimal-first**。

DayoptがMarvinに寄せすぎると、カスタマイズ可能なタスク管理アプリの劣化版になる。
Dayoptは「選択肢を減らす」「入力を減らす」「時間のズレだけを見る」で差別化する。

## 盗めそうな部分

### P1: Capacity estimator の考え方

Marvinの Day Planning は、計画が現実的かどうかを判断する capacity estimator を持つ。
Dayoptでも、計画時間が詰まりすぎている/空白が多い/実績との差が大きい、という見せ方に応用できる。

Dayopt訳:

```text
今日の計画は、現実の時間に収まっているか。
```

### P1: Focus を1つに絞る発想

Super Focus Mode / Spotlight は、Dayoptの「今の記録中タグ」「今日だけに集中」に翻訳できる。

Dayopt訳:

```text
いま何に時間を使っているかだけが見える。
```

### P1: Time estimates / tracking から planned actual 表示を強める

Marvinは見積もりと実績の考え方を持つ。
Dayoptではこれをもっと直接的にする。

```text
予定 2h
実績 1h30m
差分 -30m
```

### P2: Feature toggles を“やらないこと”として学ぶ

Marvinは enable/disable any feature が強み。
Dayoptは逆に、設定を増やさないことを強みにする。

Dayopt訳:

```text
選べる設定を増やすのではなく、迷わない体験を固定する。
```

### P2: Import/Export の安心感

Marvinは多くのツールからimportできる。
Dayoptではimport競争は不要だが、CSV export / データを閉じ込めない訴求は参考になる。

### P3: ADHD/procrastination文脈の観察

DayoptをADHD支援ツールとして打ち出す必要はないが、「やることが多すぎて動けない」層には刺さる可能性がある。
その場合も、Dayoptはタスクを増やすのではなく、時間を1つずつ置く方向で対応する。

## 盗まない方がいい部分

| 機能/思想              | 理由                   |
| ---------------------- | ---------------------- |
| 100+ features          | Dayoptの軽さが壊れる   |
| 300+ settings          | 設定疲れを生む         |
| Custom workflows       | 迷わない体験と衝突     |
| Gamification           | 核ではない             |
| Accountability Pledge  | 別プロダクト感が強い   |
| Task Jar               | タスク管理に寄りすぎる |
| Procrastination Wizard | 行動支援アプリ化する   |
| Habits / Goals         | 習慣・目標管理に広がる |
| Recurring tasks        | 削る方針と衝突         |
| Kanban / GTD強化       | Todo管理に寄りすぎる   |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
自分だけの生産性システムを作る
100以上の機能から選べる
タスクを始めるための行動支援
習慣・目標・ゲーム化で継続
```

使いたい表現:

```text
設定を増やさず、今日の時間だけを整える
Todoではなく、時間を置く
予定と実績を、1つの時間ブロックで見る
がんばりを測るのではなく、ズレを次の計画に戻す
```

## Dayoptへの示唆

Amazing Marvinは、自由度・機能量・行動支援で非常に強い。
Dayoptはそこに寄せず、もっと意見のある最小ツールにする。

```text
Amazing Marvin = 自分に合う生産性システムを組み立てる task manager
Dayopt = タグを時間に置き、予定と実績の差分で明日を補正する timebox tool
```

DayoptはMarvinから、capacity estimator / focus narrowing / time estimates の見せ方を学ぶ。
ただし、custom workflows / 大量設定 / gamification / ADHD支援機能は盗まない。

## 次に検討したいこと

- [ ] Reviewで「予定が現実的だったか」を見る最小指標を検討する
- [ ] 記録中タグの見せ方を「今これだけ」に寄せる
- [ ] 設定を増やさない方針を明文化する
- [ ] Gamification / Goals / Habits は非採用方針として整理する
- [ ] CSV export / データ所有の安心感をLPに入れるか検討する
