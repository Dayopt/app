# 競合調査: Motion

> アーカイブ元: GitHub Issue #1269（label: 競合）
> 取り込み日: 2026-06-15
> このドキュメントは継続観察用の調査メモ。一次情報は各競合の公式サイトを参照。

---

## 概要

Motion は、AIによる自動スケジューリングを中心に、タスク・カレンダー・プロジェクト管理を統合する productivity app。
Dayopt とは「タスク/予定をカレンダーに配置する」「時間ブロックで一日を設計する」「予定変更に応じて再配置する」という領域で重なる。

ただし、Motion は **AI Scheduler / Auto Planning-first**。Dayoptは、AIに全部任せる方向ではなく、ユーザーが軽くタグを置き、予定と実績のズレを見て補正する方向で差別化したい。

- 公式サイト: https://www.usemotion.com/
- Pricing: https://www.usemotion.com/pricing
- AI Calendar: https://www.usemotion.com/ai-calendar
- AI Task Manager: https://www.usemotion.com/ai-task-manager
- AI Project Manager: https://www.usemotion.com/ai-project-manager
- Meeting Scheduler: https://www.usemotion.com/meeting-scheduler
- Integrations: https://www.usemotion.com/integrations

## 競合分類

| 観点           | 評価                                                               |
| -------------- | ------------------------------------------------------------------ |
| 機能競合       | 高い。AI calendar / tasks / project manager / time blocking を持つ |
| コンセプト競合 | 中〜高。時間ブロックは近いが、自動スケジューリング思想が強い       |
| ターゲット競合 | 高い。busy professionals / teams / managers / founders 向け        |
| 価格競合       | 中。高価格帯。Individual $34/月または年払い $19/月程度のレンジ     |
| UX思想         | AI-first / Auto-scheduling-first。Dayoptとは対照的                 |

## 公式上の主な訴求

- AI calendar / AI task manager / AI project manager
- automatically plan your day
- auto-schedule tasks into calendar
- reprioritize and rebuild schedule when things change
- tasks, calendar, meetings, projects を1つにまとめる
- deadline / priority / duration をもとにスケジュール化
- meeting scheduler
- team project planning
- integrations with Google Calendar / Outlook / Zoom / Zapier 等

## 価格

2026-06-07時点で確認した公式pricingでは、高価格帯のSaaSとして位置づけられる。

| Plan            |                            価格感 | 備考                               |
| --------------- | --------------------------------: | ---------------------------------- |
| Individual      | 約 $34/月 または年払いで約 $19/月 | 個人向け                           |
| Team / Business |           個人より高い user/month | team planning / collaboration 向け |

Dayoptの $5 Pro 想定とは価格帯が大きく違う。
Motionは「AIが予定を自動で組むなら高くても払う」層を狙っている。

## 主な機能

### AI Calendar / Auto Scheduling

Motionの中核は、AIがタスクをカレンダーに自動配置すること。
タスクの期限・優先度・所要時間・空き時間をもとに、カレンダー上へ自動でtime blockする。
予定が変わると、残りタスクを再スケジュールする。

Dayoptとの重なり:

```text
タスクを作る
↓
所要時間/期限/優先度を入れる
↓
AIがカレンダーに配置する
↓
予定変更時に再配置する
```

Dayoptでは、AIが全部決めるのではなく、ユーザーがタグを軽く置き、実績差分から次の計画を補正する。

### AI Task Manager

Motionはタスク管理も強く、deadline / priority / duration をもとにスケジュールへ反映する。
Dayoptでは、タスク管理自体は外部ツールに任せたい。

Dayopt訳:

```text
タスクを管理しない。時間を受け止める。
```

### AI Project Manager

Motionはプロジェクト管理領域にも広がっており、team workflows / project planning / task dependencies に近い機能を持つ。
Dayoptではこれは盗まない。初期ターゲットは個人の時間ブロック・記録・Review。

### Meeting Scheduler

会議候補時間の共有や scheduling も持つ。
Dayoptの核ではない。
将来的にカレンダー連携があっても、会議調整プロダクトには寄せない。

### Integrations

Motionは Google Calendar / Outlook Calendar / Zoom / Zapier などと連携する。
Dayoptでも外部連携はあり得るが、タスクの集約や自動配置より、MCP/API-firstで時間データを読める・書ける方向が合う。

## Dayoptとの違い

```text
Motion:
タスクを作る
↓
期限・優先度・所要時間を設定する
↓
AIがカレンダーに自動配置する
↓
予定変更に応じてAIが再配置する
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

Motion は **AI-first / Task-first / Auto-scheduling-first**。
Dayopt は **Timebox / Tag-first / Manual-lightweight / Review-first**。

DayoptがMotionに寄せすぎると、複雑な自動スケジューリング競争になる。
Dayoptは「AIが勝手に決める」のではなく、「自分で置いて、ズレを見る」方向を守る。

## 盗めそうな部分

### P1: 予定変更時に“残り時間”を意識する発想

Motionは予定が変わると残りタスクを再配置する。
Dayoptでは自動再配置までは不要だが、「予定からズレたあと、残り時間がどう変わったか」をReviewに出すのは有効。

Dayopt訳:

```text
予定が崩れたあと、どこに時間が残ったかを見る。
```

### P1: duration / deadline より “時間枠に収まるか” の見せ方

Motionは duration を軸に自動配置する。
Dayoptでは、durationを複雑に扱わず、予定/実績/差分で現実性を見る。

例:

```text
今日の計画: 6h
実績: 4h30m
差分: -1h30m
空白: 45m
```

### P1: AI競合への対比コピー

MotionのようなAI自動化競合があるからこそ、Dayoptは「AIが全部決める」ではなく「AIが読める時間データ」として打ち出せる。

Dayopt訳:

```text
AIに予定を丸投げする前に、自分の時間のズレを見える化する。
```

または:

```text
AIが勝手に組むのではなく、あなたの予定と実績をAIが読める形にする。
```

### P2: Calendar-first の見せ方

Motionはタスクをカレンダー上に置く体験を前面に出している。
Dayoptも、リストではなくCalendar/Timelineを主画面にする方向は正しい。

### P2: High price competitor としての比較

Motionは高価格帯。
Dayoptは $5 Pro で、より軽い個人向けtimebox toolとして対比できる。

## 盗まない方がいい部分

| 機能/思想                        | 理由                                     |
| -------------------------------- | ---------------------------------------- |
| AI auto-scheduling               | Dayoptの手触り・自己決定感と衝突しやすい |
| Task priority system             | タスク管理に寄りすぎる                   |
| Deadline-driven planning         | Todo/PMアプリ化する                      |
| Project manager                  | 初期スコープ外                           |
| Team planning                    | 初期ターゲットではない                   |
| Meeting scheduler                | 別プロダクト領域                         |
| Auto reprioritization            | ブラックボックス感が増える               |
| Dependencies / workload planning | Dayoptの軽さが崩れる                     |

## Dayoptの差別化メッセージ候補

避けたい表現:

```text
AIがあなたの予定を自動で組みます
タスクの優先度と期限から最適化します
プロジェクトも会議も全部まとめます
```

使いたい表現:

```text
AIに任せる前に、今日の時間を自分で軽く置く
予定と実績のズレを、1つの時間ブロックで見る
自動化ではなく、補正するためのReview
外部AIが読める、きれいな時間データ
```

## Dayoptへの示唆

Motionは、「AIが計画を自動で作る」方向の代表競合。
Dayoptはその逆に、**ユーザーが軽く置けること**と**実績差分がきれいに残ること**で差別化する。

```text
Motion = AIがタスクをカレンダーに自動配置する scheduling assistant
Dayopt = タグを時間に置き、予定と実績の差分で明日を補正する timebox tool
```

DayoptはMotionから、残り時間・計画崩れ時の補正・Calendar-firstの見せ方を盗む。
ただし、AI auto-scheduling / project manager / meeting scheduler は盗まない。

## 次に検討したいこと

- [ ] Reviewで「予定が崩れた後の残り時間」を見せるか検討する
- [ ] AI訴求を「自動スケジューリング」ではなく「MCP/APIで読める時間データ」に寄せる
- [ ] LPで「自動化ではなく補正」という表現を検討する
- [ ] Task priority / deadline / project manager は非採用方針として明文化する
- [ ] Calendar-first / Timebox-first の主画面価値を整理する
