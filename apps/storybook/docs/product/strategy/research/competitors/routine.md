# 競合調査: Routine

> アーカイブ元: GitHub Issue #1265（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Routine は、タスク・カレンダー・会議・プロジェクト・ノート・AIを統合した productivity app。
Dayopt とは「tasks/events を1画面の planner に集約し、time blocking で日々の計画を作る」という領域で重なる。

Super Productivity が OSS / local-first 寄り、Sunsama が daily planning ritual 寄り、Akiflow が integrated productivity hub + speed 寄りだとすると、Routine は **tasks/calendar/notes/databases/AI を1つに寄せる workspace 型 daily planner** として見たい。

- 公式サイト: https://www.routine.co/
- Pricing: https://www.routine.co/pricing
- Integrations: https://www.routine.co/integrations
- Planner: https://www.routine.co/features/planner
- Time blocking: https://www.routine.co/features/time-blocking
- Time tracking: https://www.routine.co/features/time-tracking
- Keyboard shortcuts: https://www.routine.co/features/keyboard-shortcuts
- Universal inbox: https://www.routine.co/features/universal-inbox

## 競合分類

| 観点           | 評価                                                                            |
| -------------- | ------------------------------------------------------------------------------- |
| 機能競合       | 高い。calendar / tasks / notes / planner / time blocking / time tracking を持つ |
| コンセプト競合 | 中〜高。Dayoptより workspace / database 色が強いが、時間ブロックは近い          |
| ターゲット競合 | 高い。executives / freelancers / managers / founders / teams 向け               |
| 価格競合       | 中。Freeあり。Professional は $12/月予定、Business は $15/user/月予定           |
| UX思想         | Workspace-first + AI-first + Planner。Dayoptより統合OS志向が強い                |

## 公式上の主な訴求

- “One App for Tasks, Calendar & Notes, Powered by AI”
- tasks / meetings / projects / notes / AI を1つで管理
- 100k+ ambitious professionals and teams
- quick capture via desktop hotkey
- AI meeting notes
- universal inbox
- AI voice assistant
- AI agents / automations
- planner / time blocking
- labels / priorities / projects
- recurrences
- menu bar widget
- time tracking
- multi-account calendar aggregation
- databases / custom types / views / workspaces
- keyboard shortcuts / natural language / offline / smart planning

## 価格

2026-06-07時点の公式 pricing 表記では以下。

| Plan         |           価格 | 備考                                                                                                                          |
| ------------ | -------------: | ----------------------------------------------------------------------------------------------------------------------------- |
| Free         |   Free forever | calendars / tasks / contacts / notes / time blocking / natural language / integrations / device sync                          |
| Professional |      $12/month | Coming Soon。offline / undo / filtered views / automations / availability sharing / smart planning / advanced integrations 等 |
| Business     | $15/user/month | Coming Soon。workspaces / access control / real-time editing / comments 等                                                    |
| Enterprise   |   要問い合わせ | Coming Soon。advanced access control / provisioning / dedicated support 等                                                    |

Freeで time blocking まで含めている点は、DayoptのFree/Pro設計に影響がある。
Dayoptは $5 Pro 想定なので、Routineより軽い価格・軽い機能で差別化できる。

## 主な機能

### Planner / Time Blocking

Routine は planner で tasks and events を1画面にまとめ、time blocking で重要タスクの時間を確保する。
公式サイトでも “Plan your tasks and events through a single screen” “Block time for your most important tasks” と説明している。

Dayoptとの重なり:

```text
タスク/イベントを集める
↓
Plannerで日/週を見る
↓
重要タスクに時間をブロックする
↓
実行する
```

Dayoptでは task ではなく tag / entry を起点にする。

### Time Tracking / Menu Bar Widget

Routine は upcoming meetings や time tracking を menu bar widget で扱える。
Dayoptも「今なにをしているか」を軽く確認・開始/停止できる導線は参考になる。

ただし Dayoptは menu bar app を初期に作るより、PWAでの軽量開始/停止、キーボード操作、モバイルフッターのタグ選択に集中した方がよい。

### Universal Inbox / Integrations

Routine は tasks, messages, notifications を universal inbox に集約し、多数の外部サービスと bidirectional sync する方向。

Dayoptではこの方向を真似ると、Todo管理/ワークスペースOS化するリスクが大きい。
外部タスクは GitHub / Linear / Todoist などに残し、Dayoptは「使った時間」だけを受け止める方が合う。

### Notes / Pages / Databases / Custom Types

Routine は notes / pages / databases / custom types / views を持ち、Notion的な workspace 方向にも広がっている。

Dayoptではこれは盗まない。
仕様・ドキュメントは Storybook / repo docs に集約し、アプリ本体は時間ブロックに集中する。

### AI Meeting Notes / AI Agents / Automations

Routine は AI meeting notes、AI voice assistant、AI agents、automations を前面に出している。
Dayoptでは内蔵AIを前面に出すより、MCP/API-firstで外部AIが時間データを読める設計の方が合う。

### Keyboard Shortcuts / Natural Language

Routine は keyboard shortcuts、desktop hotkey、natural language を訴求している。
ここは Dayopt にかなり参考になる。

Dayoptでは自然言語よりも、タグ選択・時間操作・確定/開始停止のショートカットを優先したい。

## Dayoptとの違い

```text
Routine:
タスク/会議/メッセージ/ノート/データベースを集める
↓
Plannerで日/週に配置する
↓
AIやautomationsで整理・委任する
↓
workspace全体のOSにする
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

Routine は **Workspace-first / AI-first / Integration-first**。
Dayopt は **Timebox / Tag-first / Minimal-first**。

DayoptがRoutineに寄せすぎると、Notion/Akiflow/ClickUp的な統合workspace競争に巻き込まれる。
Dayoptは「workspaceを作らない」「タスクを集めない」「時間のズレだけに戻す」で差別化する。

## 盗めそうな部分

### P1: Plannerの一画面性

Routine は tasks and events を single screen で扱う。
Dayoptでも、Calendar上で予定と記録が同じエントリとして見える一画面性を強く出したい。

Dayopt訳:

```text
予定と記録が、同じ時間ブロックに閉じる。
```

### P1: Quick capture / desktop hotkey 的な速さ

Routine は desktop hotkey で高速キャプチャできる。
Dayoptでは、タグ1タップ/ショートカットで時間ブロックを作る体験に翻訳できる。

候補:

```text
数字: 最近使ったタグを選択
Enter: 確定
Space: 現在の記録開始/停止
T: タグ選択
R: Reviewへ移動
```

### P1: Time tracking を「今の状態」として見せる

Routineの menu bar widget 的発想は、Dayoptの「いま何を記録しているか」の視認性に応用できる。

Dayopt訳:

```text
今の記録中タグが常にわかる。
開始/停止は1操作。
```

### P2: URL embeds / references

Routine は references / URL embeds を持つ。
Dayoptでも、GitHub Issue / PR / Claude / Codex / SlackログなどのURLを entry に貼れると、外部タスクを奪わず文脈だけ接続できる。

### P2: Calendar accounts aggregation の見せ方

Routineは work & personal calendars を集約する。
DayoptでGoogle Calendar等を扱う場合も、「同期して置き換える」より「時間の文脈として見る」くらいに抑えるのがよさそう。

### P3: Free plan の参考

RoutineはFreeでも time blocking を含めている。
Dayoptも核である timebox / planned actual はFreeに置き、ProはMCP/API/履歴/高度export等に寄せる方が自然かもしれない。

## 盗まない方がいい部分

| 機能/思想                        | 理由                                     |
| -------------------------------- | ---------------------------------------- |
| Universal inbox                  | Todo/通知集約アプリ化する                |
| Databases / custom types         | Notion/ClickUp方向に重くなる             |
| AI agents / automations          | Dayoptの初期価値がぼやける               |
| AI meeting notes                 | 別プロダクト領域。議事録アプリ競争になる |
| Workspaces / team OS             | 初期ターゲットではない                   |
| Bidirectional integrations       | 実装・運用コストが大きい                 |
| Recurrences                      | 削る方針と衝突                           |
| Project/CRM/knowledge management | Dayoptの核から外れる                     |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
仕事を1つのワークスペースに集約
AIエージェントで業務を自動化
会議/ノート/タスク/DBを一元管理
チームのOS
```

使いたい表現:

```text
ワークスペースではなく、時間の器
タスクを集めず、使った時間だけを整える
タグを置くだけで、予定と実績がつながる
外部ツールはそのまま。Dayoptは時間のズレを見える化する
```

## Dayoptへの示唆

Routineは「タスク/カレンダー/ノート/DB/AIを1つにまとめる」方向の競合。
Dayoptはその逆に、**まとめないこと**を価値にしたい。

```text
Routine = 仕事の情報を1つに集約する workspace planner
Dayopt = 今日の時間ブロックを軽く置き、実績差分で明日を補正する timebox tool
```

DayoptはRoutineから、single-screen planner / quick capture / keyboard shortcuts / references を盗む。
ただし、universal inbox / databases / AI agents / workspaces は盗まない。

## 次に検討したいこと

- [ ] Dayoptの「Calendar = single-screen planner」としての見せ方を整理する
- [ ] 記録中タグの常時表示/開始停止UIを検討する
- [ ] EntryにURL/referenceを持たせるか検討する
- [ ] Freeで timebox / planned actual をどこまで開放するか検討する
- [ ] Universal inbox / workspace / database は非採用方針として明文化する
- [ ] AI訴求を「内蔵AI」ではなく「MCP/APIで読める時間データ」に寄せる
