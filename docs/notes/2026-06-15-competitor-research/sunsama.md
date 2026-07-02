# 競合調査: Sunsama

> アーカイブ元: GitHub Issue #1263（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Sunsama は、タスク管理・カレンダー・日次計画を統合した有料の daily planner。
Dayopt とは「今日の計画を立てる → 実行する → planned / actual を確認する → 次の日の計画に戻す」という日次ループが強く重なるため、最重要競合として継続観察したい。

- 公式サイト: https://www.sunsama.com/
- Pricing / manifesto: https://help.sunsama.com/docs/billing/pricing-manifesto/
- Planned and Actual Times: https://help.sunsama.com/docs/usage-guides/tasks/planned-and-actual-times/
- Daily Planning: https://help.sunsama.com/docs/usage-guides/daily-planning/
- GitHub Integration: https://help.sunsama.com/docs/integrations/github/
- Command Palette: https://help.sunsama.com/docs/usage-guides/keyboard-driven-actions/command-palette/
- Export settings: https://help.sunsama.com/docs/settings/user-settings/

## 競合分類

| 観点           | 評価                                                                |
| -------------- | ------------------------------------------------------------------- |
| 機能競合       | 非常に高い。task / calendar / daily planner / planned actual を持つ |
| コンセプト競合 | 非常に高い。Dayoptの日次ループにかなり近い                          |
| ターゲット競合 | 高い。modern professionals / 知的労働者 / 開発者にも刺さる          |
| 価格競合       | 中。高価格だが、習慣化できるユーザーには強い                        |
| UX思想         | calm daily planner。Dayoptより儀式設計が強い                        |

## 公式上の主な訴求

- “Make work-life balance a reality”
- task manager / calendar / daily planner for modern professionals
- guided daily planning
- planned and actual times
- daily shutdown / weekly planning 系の習慣導線
- GitHub / Jira / Slack / Gmail / Notion / Trello などとの連携
- command palette / keyboard driven actions
- CSV / JSON export
- 高価格でも burnout を避ける価値を訴求

## 主な機能

### Daily Planning

Sunsama の中核は、毎日の計画を guided flow として作ること。
単なるタスクリストではなく、「今日どれをやるか」「どれくらい時間を使うか」「カレンダー上にどう置くか」を日次で整理させる。

Dayoptとの重なり:

```text
今日の計画を作る
↓
カレンダー / タイムラインに置く
↓
実行する
↓
一日の終わりに見直す
```

Dayoptもこのループを持つが、Sunsamaは儀式性・誘導の丁寧さが強い。

### Planned and Actual Times

Sunsama は planned time と actual time を公式ヘルプで一級機能として扱っている。
タスクに予定時間を設定し、timer や手入力で実績時間を記録できる。
設定次第で planned time を actual として扱うこともできる。

Dayopt の planned / actual 1エントリ設計とかなり近い。
ただし Sunsama は task-first、Dayopt は timebox / tag-first。

### Integrations

- GitHub
- Jira
- Slack
- Gmail
- Notion
- Trello
- Asana
- Todoist
- Google Calendar / Outlook Calendar など

外部ツールからタスクを取り込み、Sunsama内で今日の計画に落とす思想。
Dayoptでは、Issue import を真似るより、URL添付 / MCP / API-first で「タスク管理は外部に残す」方が合いそう。

### Keyboard / Command Palette

Sunsama は command palette を持ち、マウス操作だけでなくキーボード中心で操作できる。
Dayoptも開発者・パワーユーザー向けなら、ここはかなり参考になる。

### Export

CSV / JSON export が可能。
時間・タスクの蓄積データを閉じ込めない安心感がある。
Dayoptでも Free 含めて export は信頼獲得に効きそう。

## Dayoptとの違い

```text
Sunsama:
タスクを集める
↓
今日やるものを選ぶ
↓
予定時間を入れる
↓
カレンダーに置く
↓
実績を記録する
↓
日次/週次で振り返る
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

Sunsama は Task-first + Ritual-first。
Dayopt は Timebox / Tag-first。

DayoptがSunsamaに寄せすぎると、「丁寧な日次計画アプリ」の劣化版になりやすい。
Dayoptはより短い儀式、より軽い入力、より直接的な予定/実績差分で勝つべき。

## 盗めそうな部分

### P1: 日次計画の儀式設計

Sunsama の最大の強みは、毎朝/毎日の計画を自然に始めさせること。
Dayoptでも、Calendarを単なるカレンダーではなく「今日の時間を整える場所」として見せたい。

Dayopt訳:

```text
今日、何に時間を使うかを先に置く。
終わったら、予定と実績のズレだけを見る。
```

### P1: planned / actual を一級機能として見せる

Dayoptの強みと最も重なる。
LPやReviewで「予定と実績が1つの時間ブロックで見える」を明確に打ち出す。

例:

```text
Work
予定 2h
実績 1h30m
差分 -30m
```

重要なのは、実績記録を「反省」ではなく「補正」として扱うこと。

### P1: calm / burnout 回避のコピー

Sunsama は高価格でも、burnout を避ける価値を強く訴求している。
Dayoptも「もっと詰め込む」ではなく「今日の時間を現実的に整える」方向のコピーが合う。

Dayopt訳:

```text
予定を詰め込むためではなく、現実の時間に戻すためのプランナー。
```

### P2: daily shutdown / review

Dayoptの Review は、Sunsama 的な shutdown をもっと軽量化したものにできる。

例:

```text
今日のズレだけ見る
- 予定より長かったタグ
- 予定より短かったタグ
- 空白になった時間
- 明日に戻すもの
```

### P2: Command Palette

開発者向けなら、command palette / keyboard-first は盗める。

候補:

```text
P: 今日の計画を開く
R: Reviewを開く
Space: 現在の記録開始/停止
Enter: 選択中エントリ確定
数字: 最近使ったタグ選択
```

### P3: Export の安心感

SunsamaがCSV/JSON exportを用意しているように、Dayoptも時間データを閉じ込めないことを明記したい。

## 盗まない方がいい部分

| 機能/思想                    | 理由                           |
| ---------------------------- | ------------------------------ |
| 外部タスク import の作り込み | Todo管理アプリに寄りすぎる     |
| Guided flow の重厚化         | Dayoptの軽さが失われる         |
| 週次計画・週次目標の作り込み | Reviewが重くなる               |
| Slack連携前提の運用          | Dayoptの最小Ops方針とズレる    |
| 高価格SaaS感の強い訴求       | Dayoptの $5 Pro 想定と違う     |
| タスク中心の語彙             | Timebox / Tag-first がぼやける |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
タスクを全部集める
日次計画をガイドする
ワークライフバランスを管理する
生産性を高めるオールインワン
```

使いたい表現:

```text
予定と実績を、1つの時間ブロックで見る
Todoではなく、時間を整える
計画倒れを責めず、ズレを次の計画に戻す
タグを選ぶだけで、今日の時間が形になる
```

## Dayoptへの示唆

Sunsamaは、Dayoptにとって「日次ループのUX完成度」を見るための最重要競合。
Super Productivity が OSS / developer / planned actual の競合だとすると、Sunsama は **daily planning ritual** の競合。

Dayoptは Sunsama より軽く、短く、時間ブロック中心にすることで差別化できる。

```text
Sunsama = 今日やるタスクを丁寧に計画するアプリ
Dayopt = 今日の時間ブロックを軽く置き、実績差分で明日を補正するアプリ
```

## 次に検討したいこと

- [ ] DayoptのLPで「Todoではなく時間」を明確に打ち出す
- [ ] Reviewで planned / actual / diff の最小表示パターンを作る
- [ ] 日次終了時の軽い Review 導線を検討する
- [ ] Guided planning を入れる場合でも、1〜2ステップに抑える
- [ ] CSV / JSON export を Free に含めるか検討する
- [ ] 外部タスク import は非採用、URL添付 / MCP / API-first に寄せるか整理する
