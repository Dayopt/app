---
status: current
last_verified: 2026-08-25
code: .claude/skills/night-watch/SKILL.md
---

# 計測夜勤（night-watch）運用

夜間に read-only の品質観測を行う GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job、#2483 で night-watch.yml から統合）の運用ページ。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205)、v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)、v2（盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)、**v3（Claude Routine から GitHub Actions cron への移植）は [#2367](https://github.com/Dayopt/dayopt/issues/2367)**。手順そのものの正本は [`.claude/skills/night-watch/SKILL.md`](../../.claude/skills/night-watch/SKILL.md)（本ページはこの複製ではなく、運用面の補足のみ）。判定ロジックの正本は `scripts/ci/night-watch/run-all.mjs`。

## 常設運行記録 issue と盤面 issue

night-watch は毎晩、常設の運行記録 issue へ1コメントを残す:

- 運行記録 issue: **#2216**

**v2 で書き込み先が拡張された**（[#2291](https://github.com/Dayopt/dayopt/issues/2291)）。上記の常設運行記録 issue に加え、当日/前日の日次盤面 issue（`type:board` ラベル）への起票・close・コメントも行う。実行内容は `.claude/skills/night-watch/SKILL.md` §自動パート が正本。書き込み先はこの 2 種類の issue に限る（§守ること）。

## secrets

- `NIGHT_WATCH_DEPENDABOT_TOKEN`（Dependabot alerts: read の fine-grained PAT、`dependabot-alerts` check 専用）
- `SENTRY_AUTH_TOKEN`（1Password `sentry-cli-readonly` item と同じ read-only scope、`sentry-new` check 専用）

いずれも GitHub Actions の repository secrets として登録する（値の登録・更新は指揮台/User の操作枠）。`GH_TOKEN`（`github.token`）は secrets 登録不要（workflow が自動生成する）。未登録の間は `.github/workflows/nightly.yml`（night-watch job）の secrets 存在確認 step が fail closed で job を止める（無音失敗にしない）。

## 故障検出手順

朝の編成 sweep（`.claude/rules/orchestration.md` §1 日サイクル）で確認する:

1. 常設運行記録 issue に前夜（当日 JST 未明）のコメントが付いているか確認する
2. 付いていなければ、`gh run list --workflow=nightly.yml --limit 10` で直近 run 一覧を取得し、04:00 JST 前後の run を `gh run view <run-id>` で開いて night-watch job の状態を確認する（#2483 で nightly.yml へ統合されたため、workflow 名だけでは night-watch の cron を一意に絞れない）
3. run が失敗していれば `gh run view <run-id> --log-failed` でログを確認する。secrets 未登録・permissions 不足・Sentry CLI checksum 不一致などが典型的な原因（`.claude/skills/night-watch/SKILL.md` §故障モード 参照）
4. run 自体が発火していない（schedule が動いていない）場合は `nightly.yml` の `on.schedule` 設定（04:00 JST の cron エントリ）と GitHub Actions 自体の稼働状況を確認する
5. run は成功しているのに運行記録コメントが無ければ、Step 5（`runOpsLogReport`）が異常終了して job が非 0 exit している可能性が高い（`.claude/skills/night-watch/SKILL.md` §自動パート の Step 5 参照）。ログで原因を特定し、必要なら `.claude/skills/night-watch/SKILL.md` §手動代行 で当夜分を代行する

## checklist・baseline の変更

checklist（[`checklist.md`](../../.claude/skills/night-watch/checklist.md)）と baseline（[`baseline.json`](../../.claude/skills/night-watch/baseline.json)）の変更は通常の PR レビューを通す。night-watch 自身（Actions workflow・手動代行のどちらも）はこの2ファイルを読むだけで編集しない（review-gated ratchet）。

## 撤退条件

#2205 決定コメントに記載の観点を、常設運行記録 issue の毎晩の実績から月次ガーデニングで判定する:

- 夜勤起票 issue の誤検知（朝の triage で invalid close）が継続的に発生する
- 運行記録の維持・checklist のメンテコストが、防いだ劣化を上回る
- 欠番率（運行記録コメントの欠落）や権限境界のインシデントが常態化する
