# 競合調査: Ellie

> アーカイブ元: GitHub Issue #1266（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Ellie は、brain dump / daily Kanban / timebox view を中核にしたシンプルな daily planner。
Dayopt とは「今日の予定を軽く作る」「タスクを時間に置く」「時間の使い方を可視化する」という領域で重なる。

Sunsama / Akiflow / Routine が高機能・統合ハブ寄りなのに対して、Ellie はより軽量で、Dayoptに近い **simple daily planner / timeboxing app** として観察価値が高い。

- 公式サイト: https://ellieplanner.com/
- Pricing: https://ellieplanner.com/pricing
- Features guide: https://guide.ellieplanner.com/
- Web App: https://app.ellieplanner.com/
- iOS App: https://apps.apple.com/app/ellie-planner/id1626821560
- Changelog: https://feedback.ellieplanner.com/changelog

## 競合分類

| 観点           | 評価                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| 機能競合       | 高い。daily planner / time blocking / time tracking / analytics を持つ |
| コンセプト競合 | 高い。シンプルな日次計画・timeboxing という思想がDayoptに近い          |
| ターゲット競合 | 中〜高。学生、創業者、個人ユーザー、シンプル派に刺さる                 |
| 価格競合       | 中。Freeあり、Proは $9.99/月、買い切り $299.99                         |
| UX思想         | Brain dump + Daily Kanban + Timebox。Dayoptよりtask-firstだが軽量      |

## 公式上の主な訴求

- “A better daily planner”
- thoughts を整理し、1日を beautiful and simple app で計画する
- timeboxing your day
- brain dump
- recurring tasks
- analytics + built-in time tracker
- native iOS app
- Google / Apple / Outlook calendar integrations
- Time tracking / Email forwarding / Subtasks
- Notion integration / Zapier integration / Siri shortcuts
- Labels & filtering / Week calendar view / Today only mode / Rituals
- Mac app / Windows app

## 価格

2026-06-07時点の公式 pricing 表記では以下。

| Plan               |             価格 | 備考                                                                                                           |
| ------------------ | ---------------: | -------------------------------------------------------------------------------------------------------------- |
| Free               |             Free | unlimited task creation / iOS & Web App / Braindump                                                            |
| Ellie Pro          |         $9.99/月 | Timebox mode / Google Calendar / Apple Calendar / unlimited labels & subtasks / recurring tasks / due dates 等 |
| Ellie Pro Lifetime | $299.99 一回払い | Pro subscription と同等の買い切り                                                                              |

Freeでは基本の task creation / braindump が使えるが、Timebox mode はPro側。
Dayoptの核をFreeに置くかProに置くかを考えるうえで参考になる。

## 主な機能

### Daily Planner / Brain Dump

Ellie は、頭の中のタスクを brain dump し、それを日次のKanban/Plannerに整理する設計。
公式FAQでも、Ellieは day planner / brain dump として作られていると説明している。

Dayoptとの重なり:

```text
頭の中のタスクを出す
↓
今日の計画に整理する
↓
時間に置く
↓
実行する
```

ただしDayoptは brain dump / task list を持たず、tag / timebox を直接置く方が軽い。

### Time Blocking / Timebox View

Ellie は time blocking を主要機能として打ち出し、タスクをKanbanからカレンダーへドラッグして1日を可視化する。
公式FAQでも “great timebox view” を差別化点として挙げている。

Dayoptとの競合度が高い部分。
ただし Ellie は task-first、Dayoptは timebox / tag-first。

### Time Tracking / Analytics

Ellie は built-in time tracker と analytics を持ち、時間の使い方を可視化できる。
Dayoptの Review と重なる。

Dayoptでは analytics を重くせず、予定/実績/差分に絞ると差別化できる。

### Calendar Integrations / Platforms

- Google Calendar
- Apple Calendar
- Outlook Calendar
- Web / iOS / Mac / Windows

DayoptはPWA firstでよいが、「すぐ開ける」「常駐に近い軽さ」は参考になる。

### Today Only Mode / Rituals

Today only mode や rituals は、Dayoptの「今日の時間だけに集中する」思想と近い。
ここはかなり参考になる。

## Dayoptとの違い

```text
Ellie:
タスクをbrain dumpする
↓
Daily Kanbanに並べる
↓
必要なものをtimebox viewへ置く
↓
時間追跡・analyticsで見る
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

Ellie は **Simple Task-first / Daily Planner / Timebox**。
Dayopt は **Timebox / Tag-first / Planned-Actual-first**。

EllieはDayoptに近いが、Dayoptがtask list / Kanban / braindump を持たない設計を守れば、より削られた体験として差別化できる。

## 盗めそうな部分

### P1: “simple daily planner” の見せ方

Ellieは高機能SaaSではなく、シンプルな日次プランナーとして見せている。
Dayoptも「生産性オールインワン」ではなく、軽い日次timeboxとして打ち出したい。

Dayopt訳:

```text
今日の時間を、タグで軽く整える。
```

### P1: Today only mode

Ellieの today only mode はDayoptと相性が良い。
DayoptのモバイルはDay表示のみ方針なので、「今日だけに集中する」価値をLPやUIで言語化できる。

Dayopt訳:

```text
まずは今日だけ。今日の予定と実績だけを整える。
```

### P1: Timebox view の視覚的わかりやすさ

EllieはKanbanからcalendar/timeboxにドラッグする形。
Dayoptでは、タグから時間ブロックを作る操作として翻訳できる。

```text
タグを押す
↓
時間に置く
↓
予定と記録が同じブロックになる
```

### P1: Analytics を「軽い可視化」として扱う

Ellieはanalyticsを持つが、Dayoptはもっと軽くてよい。

Dayopt訳:

```text
統計ではなく、ズレを見る。
```

### P2: Brain dump を“やらないこと”として学ぶ

Ellieのbrain dumpは便利だが、Dayoptに入れるとTodo管理に寄る。
ここは盗むより、明確に非採用方針として整理した方がよい。

Dayopt訳:

```text
Todoは集めない。時間だけを整える。
```

### P2: Native app 的な即時性

EllieのiOS/Mac/Windows展開から、Dayoptも「すぐ開ける」ことの重要性は学べる。
ただし初期はPWAで十分。

## 盗まない方がいい部分

| 機能/思想                              | 理由                              |
| -------------------------------------- | --------------------------------- |
| Brain dump                             | Todo管理アプリ化する              |
| Daily Kanban                           | Dayoptのtimebox/tag-firstが薄まる |
| Subtasks                               | 複雑化する                        |
| Recurring tasks                        | 削る方針と衝突                    |
| Email forwarding                       | タスク集約アプリになる            |
| Notion / Zapier integration の作り込み | 初期には運用コストが高い          |
| Week calendar view の強化              | モバイルDay中心方針とズレる       |
| Analyticsの高度化                      | Reviewが重くなる                  |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
タスクをbrain dumpする
Kanbanで今日のタスクを整理する
タスクを時間に割り当てる
```

使いたい表現:

```text
Todoではなく、時間を整える
タグを置くだけで、予定と実績がつながる
今日の予定と記録を、1つの時間ブロックにする
統計ではなく、ズレを見る
```

## Dayoptへの示唆

Ellieは、上位競合の中でもDayoptにかなり近い「軽量 daily planner / timeboxing」系。
ただし、Ellieは still task-first。
Dayoptは tag-first / planned-actual-first に寄せることで、より削られた体験にできる。

```text
Ellie = タスクをbrain dumpして、今日のtimeboxに置く daily planner
Dayopt = タグを時間に置き、予定と実績の差分で明日を補正する timebox tool
```

DayoptはEllieから、simple daily planner / today only / timebox view / light analytics を盗む。
ただし、brain dump / Kanban / subtasks / recurring tasks は盗まない。

## 次に検討したいこと

- [ ] LPで「今日だけに集中する」訴求を入れるか検討する
- [ ] モバイルDay表示のみ方針をプロダクト価値として言語化する
- [ ] Reviewを「Analytics」ではなく「ズレを見る」に固定する
- [ ] タグ→時間ブロック作成の最短導線を決める
- [ ] Brain dump / Kanban / subtasks は非採用方針として明文化する
- [ ] Free/Proで timebox / planned actual をどう分けるか検討する
