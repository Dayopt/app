---
status: current
last_verified: 2026-08-19
code: .claude/skills/night-watch/SKILL.md
---

# 計測夜勤（night-watch）運用

夜間に read-only の品質観測を行う Claude Routine の運用ページ。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205)、実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)。手順そのものの正本は [`.claude/skills/night-watch/SKILL.md`](../../.claude/skills/night-watch/SKILL.md)（本ページはこの複製ではなく、運用面の補足のみ）。

## 常設運行記録 issue

night-watch は毎晩、常設の運行記録 issue へ1コメントを残す。issue 番号は登録時（実装 merge 後）に指揮台が確定し、ここに追記する:

- 運行記録 issue: **未登録**（この行は指揮台が trigger 登録と同時に issue 番号へ書き換える）

## 故障検出手順

朝の編成 sweep（`.claude/rules/orchestration.md` §1 日サイクル）で確認する:

1. 常設運行記録 issue に前夜（当日 JST 未明）のコメントが付いているか確認する
2. 付いていなければ、Routine 故障を疑う。`RemoteTrigger(action: "list_runs", trigger_id: <night-watch trigger id>)` で直近の run 状態を確認する
3. run が存在するのに運行記録コメントが無ければ、`get_run_log` でログを確認し、権限の3層防御（層1 token scope・層2 allowed_tools・層3 hook allowlist）のいずれかで停止していないか切り分ける（`.claude/skills/night-watch/SKILL.md` §Step 0 自己検証が「環境故障」コメントを残しているはずなので、まずそれを確認する）
4. Routine 自体が発火していなければ、`.claude/skills/night-watch/SKILL.md` を明示 invoke して手動代行する

## checklist・baseline の変更

checklist（[`checklist.md`](../../.claude/skills/night-watch/checklist.md)）と baseline（[`baseline.json`](../../.claude/skills/night-watch/baseline.json)）の変更は通常の PR レビューを通す。night-watch セッション自身はこの2ファイルを読むだけで編集しない（review-gated ratchet。層3の allowlist にも Write/Edit は含まれない）。

## 撤退条件

#2205 決定コメントに記載の観点を、常設運行記録 issue の毎晩の実績から月次ガーデニングで判定する:

- 夜勤起票 issue の誤検知（朝の triage で invalid close）が継続的に発生する
- 運行記録の維持・checklist のメンテコストが、防いだ劣化を上回る
- 欠番率（運行記録コメントの欠落）や権限境界のインシデントが常態化する
