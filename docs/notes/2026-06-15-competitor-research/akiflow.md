# 競合調査: Akiflow

> アーカイブ元: GitHub Issue #1264（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Akiflow は、タスク・カレンダー・インボックス・AIアシスタントを統合した time-blocking digital planner。
Dayopt とは「タスク/予定を1つのカレンダーに集約し、時間ブロックとして日々の計画を作る」という領域で重なる。

Super Productivity が OSS / local-first 寄り、Sunsama が daily planning ritual 寄りだとすると、Akiflow は **integrated productivity hub + time blocking + speed/shortcut** 寄りの競合。

- 公式サイト: https://akiflow.com/
- Pricing: https://akiflow.com/pricing
- Integrations: https://akiflow.com/integrations
- Google Calendar integration: https://akiflow.com/integrations/google-calendar
- GitHub integration: https://akiflow.com/integrations/github
- Linear integration: https://akiflow.com/integrations/linear
- Todoist integration: https://akiflow.com/integrations/todoist

## 競合分類

| 観点           | 評価                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| 機能競合       | 高い。calendar / tasks / inbox / time blocking / routines を持つ         |
| コンセプト競合 | 中〜高。Dayoptより task hub 色が強いが、時間ブロック設計は近い           |
| ターゲット競合 | 高い。founders / operators / busy professionals / power users 向け       |
| 価格競合       | 中。月額 $34、年額 $19/月の高価格帯                                      |
| UX思想         | Task-first + Calendar-first + AI assistant。Dayoptより統合ハブ志向が強い |

## 公式上の主な訴求

- “One app for tasks & calendars powered by AI”
- calendars, tasks, inbox, assistant を1つにまとめる
- founders / operators / obsessed doers 向け
- one calendar that syncs
- time-block your day automatically
- plan your day / week automatically
- universal inbox & integrations
- emails / Slack messages / issues を task に変換
- AI assistant: Aki
- quick capture / natural language / voice / Cmd+K
- focus time / goals / focus mode / daily rituals
- 7-day free trial

## 価格

2026-06-07時点の公式 pricing 表記では以下。

| Plan        |   価格 | 備考            |
| ----------- | -----: | --------------- |
| Pro Monthly | $34/月 | monthly billing |
| Pro Yearly  | $19/月 | yearly billing  |

Dayopt の $5 Pro 想定とは価格帯がかなり違う。
Akiflow は「時間を節約できるなら高くても払う」層を狙っている。

## 主な機能

### One Calendar / Time Blocking

Akiflow は複数カレンダーとタスクを1つのカレンダーに集約し、time-blocking で日・週を組み立てる。
公式上でも “Time-block your day automatically” “Plan your day, week, automatically” を打ち出している。

Dayoptとの重なり:

```text
やることを集約する
↓
カレンダーに置く
↓
日/週の計画にする
↓
実行する
```

ただし Akiflow は自動スケジューリング/AI/統合ハブ寄り。
Dayoptは手触りの軽い timebox / tag-first に寄せたい。

### Universal Inbox & Integrations

Akiflow は多くの外部ツールからタスクを集約する。

代表例:

- Google Calendar / Outlook Calendar
- Gmail / Outlook Email
- Slack
- GitHub
- Linear
- Jira
- Asana
- Trello
- Todoist
- Notion
- Zapier / IFTTT

公式 integration ページでは GitHub issues や Linear issues を Akiflow に統合できると説明している。

Dayoptでは、ここを真似ると Todo管理・統合インボックスアプリになる危険がある。
Dayoptは外部タスクを奪わず、URL添付 / MCP / API-first で「時間記録の器」に徹する方がよい。

### Quick Capture / Cmd+K / Natural Language

Akiflow は「thought speed」で capture できることを訴求している。

- natural language
- voice mode
- AI chat
- Cmd+K
- mobile shortcuts
- widgets

Dayoptでも「タグを選ぶだけ」「ショートカットだけで置く」は強く参考になる。
ただしAIチャットや音声まで初期に持つ必要はない。

### AI Assistant: Aki

Akiflow は AI assistant をかなり前面に出している。

- 空き時間を見つける
- 予定を作る
- 優先順位付け
- next actions 抽出
- recurring tasks の処理
- daily briefings / reminders

Dayoptでは、AIをアプリ内価値として前面に出しすぎるより、MCP/API経由で外部AIが読める・書ける設計の方が合う。

### Productivity Toolbox

- Focus Time
- Goals
- Focus Mode
- Daily Rituals
- Privacy
- Analytics on Productivity / Tasks
- recurring tasks
- labels
- list / categories
- time slots
- availability slots

Dayoptには不要なものも多いが、「time slots」「daily rituals」「shortcuts / hotkeys」は参考になる。

## Dayoptとの違い

```text
Akiflow:
外部ツールからタスク/メール/Issueを集める
↓
AIやインボックスで整理する
↓
カレンダーに時間ブロックする
↓
日/週の計画として実行する
↓
必要に応じてAIが調整する
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

Akiflow は **Productivity Hub / Task-first / AI-first**。
Dayopt は **Timebox / Tag-first / Minimal-first**。

DayoptがAkiflowに寄せすぎると、統合ハブ・AIアシスタント・タスク管理の重い競争になる。
Dayoptは「統合しない」「奪わない」「ただ時間に戻す」で差別化したい。

## 盗めそうな部分

### P1: Capture / 操作速度の訴求

Akiflow は “Capture tasks at the speed of thoughts” として、すぐ入力できることを強く打ち出している。
Dayoptも「タグを選ぶだけ」「Enterで確定」「数字で最近使ったタグ」など、操作速度を明確な価値にしたい。

Dayopt訳:

```text
タグを選ぶだけで、今日の時間が形になる。
```

### P1: Calendar + Task を一画面で扱う見せ方

Akiflowは task と calendar を1つの flow として見せるのがうまい。
Dayoptでは task ではなく tag / entry で同じ構造を作る。

Dayopt訳:

```text
予定と記録が、同じ時間ブロックに閉じる。
```

### P1: Time slots / availability の考え方

Akiflowの time slots / availability slots は、Dayoptの「空白時間」「差分」「未配置時間」の見せ方に応用できる。

例:

```text
今日の空き時間
- 10:30–11:00 30分
- 15:00–15:45 45分
```

Dayoptでは、この空白を「新しいタスクを入れる」より「時間のズレを把握する」用途に寄せる。

### P2: Cmd+K / Command Palette

開発者向けならかなり参考になる。

候補:

```text
Cmd+K: コマンドパレット
T: タグ選択
P: 今日の予定作成
R: Reviewを開く
Space: 現在の記録開始/停止
Enter: 確定
```

### P2: AIを“内蔵チャット”ではなく“操作補助”として見る

AkiflowはAI assistantを前面に出している。
Dayoptでは、AIそのものを価値にするより、MCP/APIで外部AIが `今日の予定/実績/差分` を読める方が合う。

Dayopt訳:

```text
AIと話すアプリではなく、AIが読める時間データの器。
```

### P3: high price competitor としてのポジショニング参考

Akiflowは $19〜$34/月でも成立している。
Dayoptの $5 Pro はかなり軽い価格帯なので、「少機能・低価格・高速入力」の対比が作れる。

## 盗まない方がいい部分

| 機能/思想                      | 理由                                      |
| ------------------------------ | ----------------------------------------- |
| Universal Inbox                | タスク管理/統合ハブ化してDayoptが重くなる |
| GitHub/Linear/Jira import      | 外部タスク管理を奪う方向になる            |
| AI assistant front-and-center  | Dayoptの価値がAIチャットに見えてしまう    |
| 自動スケジューリングの作り込み | Dayoptの手触り・自己決定感と衝突しやすい  |
| Recurring tasks                | 削る方針と衝突                            |
| Goals / focus mode の拡張      | 別機能が増えすぎる                        |
| team scheduling                | Dayoptの初期ターゲットではない            |
| email/slack to task            | Todoアプリ化する                          |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
すべてのタスクを1つに集約
AIがあなたの予定を自動調整
メールやIssueをタスク化
生産性ハブ
```

使いたい表現:

```text
Todoを集めず、時間だけを整える
タグを置くだけで、予定と実績がつながる
AIに任せる前に、自分の時間のズレを見える化する
外部ツールはそのまま。Dayoptは使った時間だけを受け止める
```

## Dayoptへの示唆

Akiflowは「全部集めて、AIも使って、カレンダーで実行する」競合。
Dayoptはその逆に、**集約しすぎないこと**が差別化になる。

```text
Akiflow = 仕事の入口を全部集めてカレンダーに流す productivity hub
Dayopt = 今日の時間ブロックを軽く置き、実績差分で明日を補正する timebox tool
```

DayoptはAkiflowから操作速度・time blocking・command palette を盗む。
ただし、universal inbox / task import / AI assistant は盗まない。

## 次に検討したいこと

- [ ] Dayoptのショートカット初期セットを決める
- [ ] Cmd+K / command palette を初期から入れるか検討する
- [ ] 空白時間 / availability 的な表示を Review に入れるか検討する
- [ ] 外部URL添付は入れるが、GitHub/Linear import は非採用でよいか整理する
- [ ] AI訴求を「内蔵AI」ではなく「MCP/APIで読める」に寄せるか明文化する
- [ ] LPで「統合ハブではない」ポジションを言語化する
