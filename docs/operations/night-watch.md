---
status: current
last_verified: 2026-08-21
code: .claude/skills/night-watch/SKILL.md
---

# 計測夜勤（night-watch）運用

夜間に read-only の品質観測を行う Claude Routine の運用ページ。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205)、v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)、v2（盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)。手順そのものの正本は [`.claude/skills/night-watch/SKILL.md`](../../.claude/skills/night-watch/SKILL.md)（本ページはこの複製ではなく、運用面の補足のみ）。

## 常設運行記録 issue と盤面 issue

night-watch は毎晩、常設の運行記録 issue へ1コメントを残す。issue 番号は登録時（実装 merge 後）に指揮台が確定し、ここに追記する:

- 運行記録 issue: **#2216**

**v2 で書き込み先が拡張された**（[#2291](https://github.com/Dayopt/dayopt/issues/2291)）。上記の常設運行記録 issue に加え、当日/前日の日次盤面 issue（`type:board` ラベル）への起票・close・コメントも行う。実行手順は `.claude/skills/night-watch/SKILL.md` §自動パート Step 1（盤面起票）・Step 4（DoD監査候補コメント）が正本。書き込み先はこの 2 種類の issue に限る（§守ること）。

**Sentry token 依存（v2 追加、[#2334](https://github.com/Dayopt/dayopt/issues/2334) コメントで cloud 互換形へ改訂）**: Step 2 の `sentry-new` 観測は `SENTRY_AUTH_TOKEN`（1Password `sentry-cli-readonly` item、read-only scope）を Cloud Environment 側の env として要求する。Cloud Environment には 1Password が無いため、夜勤 Routine は `sentry` CLI が `SENTRY_AUTH_TOKEN` を直接読む cloud 互換形（`op run --` を挟まない）を使う。未配線だと `sentry` CLI が認証エラーで終了し、fail-closed 原則（§Step 2）により「取得失敗」として運行記録に記録される（`op run --` を挟む旧形は 1Password が使えるローカル環境での指揮台の手動代行専用に残す）。

**層1 token scope に `Actions: read` を追加（v2 追加）**: Step 2 の `heavy-red` 観測（`gh run list`）に必要。既存の `issues:write` + `contents:read` + `Dependabot alerts: read` に追加する形で、`contents:write` / `pull_requests:write` / `administration` は引き続き持たせない（詳細は `.claude/skills/night-watch/SKILL.md` §権限の構造的強制 層1 参照）。

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
