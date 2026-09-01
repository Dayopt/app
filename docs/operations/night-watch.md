---
status: current
last_verified: 2026-09-01
code: .claude/skills/night-watch/SKILL.md
---

# 計測夜勤（night-watch）運用

夜間に read-only の品質観測を行う GitHub Actions の scheduled workflow（`.github/workflows/nightly.yml` の night-watch job、#2483 で night-watch.yml から統合）の運用ページ。設計正本は [#2205](https://github.com/Dayopt/dayopt/issues/2205)、v1 実装は [#2209](https://github.com/Dayopt/dayopt/issues/2209)、v2（盤面起票・heavy-post-merge赤確認・Sentryスキャン・DoD監査候補選定）は [#2291](https://github.com/Dayopt/dayopt/issues/2291)、v3（Claude Routine から GitHub Actions cron への移植）は [#2367](https://github.com/Dayopt/dayopt/issues/2367)、**v4（「毎朝の読み物」層を全廃し、観測 → 赤なら起票だけに絞った）は [#2525](https://github.com/Dayopt/dayopt/issues/2525)**。手順そのものの正本は [`.claude/skills/night-watch/SKILL.md`](../../.claude/skills/night-watch/SKILL.md)（本ページはこの複製ではなく、運用面の補足のみ）。判定ロジックの正本は `scripts/ci/night-watch/run-all.mjs`。

## 出力先

**問題があれば issue、無ければ無音**（v4、[#2525](https://github.com/Dayopt/dayopt/issues/2525)、2026-09-01 User 決定）。night-watch が残す痕跡は次の 2 つだけ:

- **alert issue** — 赤の check-id ごとに `nightwatch(<check-id>)`、観測コマンド自体の取得失敗は `nightwatch-fetch-failed(<check-id>)`。どちらも `type:chore` + `area:operations` + `priority:p2` ラベル付きで dedup される（既に open なら新規起票せずコメント追記）
- **GitHub Actions の job log** — run の結論を `night-watch: <verdict> | 観測 N/7 | 起票 N | 保留 N | 起票失敗 N | 予算超過 N | 取得失敗 N` の 1 行で残す

**書き込み先は自分が起票した alert issue に限る**（`.claude/skills/night-watch/SKILL.md` §守ること）。

v3 まで存在した常設運行記録 issue #2216 への毎晩 1 コメント・当日盤面 issue（`type:board`）の起票と close・DoD 監査候補コメント・朝編成ブリーフ・その先の 05:00 JST 蒸留層は、v4 で全廃した（#2216 と `type:board` issue も close 済み）。読まれる価値より「毎日必ず何かが増える」コストが勝った、という判断。

## secrets

- `NIGHT_WATCH_DEPENDABOT_TOKEN`（Dependabot alerts: read の fine-grained PAT、`dependabot-alerts` check 専用）
- `SENTRY_AUTH_TOKEN`（1Password `sentry-cli-readonly` item と同じ read-only scope、`sentry-new` check 専用）
- `NIGHT_WATCH_HEARTBEAT_URL`（healthchecks.io の heartbeat URL。night-watch job が発火した/killed されなかったことの外部監視用。アカウント作成・値の登録は User 操作）

いずれも GitHub Actions の repository secrets として登録する（値の登録・更新は指揮台/User の操作枠）。`GH_TOKEN`（`github.token`）は secrets 登録不要（workflow が自動生成する）。未登録の間は `.github/workflows/nightly.yml`（night-watch job）の secrets 存在確認 step が fail closed で job を止める（無音失敗にしない）。

## 故障検出手順

**v4（#2525）で判定材料が変わった。** 緑の夜は issue が 1 件も増えないのが正常系なので、「無音」だけでは故障を判定できない。見るのは GitHub Actions の run そのもの:

1. `gh run list --workflow=nightly.yml --limit 10` で直近 run 一覧を取得し、04:00 JST 前後の run を `gh run view <run-id>` で開いて night-watch job の状態を確認する（#2483 で nightly.yml へ統合されたため、workflow 名だけでは night-watch の cron を一意に絞れない）
2. run が失敗していれば `gh run view <run-id> --log-failed` でログを確認する。secrets 未登録・permissions 不足・Sentry CLI checksum 不一致などが典型的な原因（`.claude/skills/night-watch/SKILL.md` §故障モード 参照）
3. run 自体が発火していない（schedule が動いていない）場合は `nightly.yml` の `on.schedule` 設定（04:00 JST の cron エントリ）と GitHub Actions 自体の稼働状況を確認する
4. job が緑なら、log の `night-watch: ...` サマリ 1 行が run の結論。**緑なのにこの行が無い場合は途中で kill された可能性がある**（`timeout-minutes: 15` の超過など）ので log を追う
5. 故障が確認できたら `.claude/skills/night-watch/SKILL.md` §手動代行 で当夜分を代行する
6. **heartbeat の未着通知が来た朝は、night-watch job 自体が発火していない/killed された可能性が高い。** `gh run list --workflow=nightly.yml` で run の有無を確認する — run 自体が見当たらなければ cron 配信の欠落・workflow 定義の破損、run はあるが早期に killed されていれば runner 枯渇等を疑う（上記 1〜4 の手順で切り分ける）

**「無音」を正常と読んでよいのは job が緑の時だけ。** 夜勤の異常は alert issue として能動的に届くが、その届く経路（gh）自体が壊れた夜は issue が出ない。この場合 night-watch job は**非 0 exit で赤くなる**設計にしてある（起票の失敗・dedup 検索の失敗を `alertPostFailed` として拾う）ので、**赤い run が「issue が来ていないこと」を信用してはいけない合図**になる。逆に言えば、job が緑で issue がゼロなら本当に何も無かった夜。

このチェックを毎朝の義務にする必要はない。Actions の失敗通知が届く経路（GitHub の通知設定）を確保した上で、run が赤い時と、長期間 issue も赤もない状態が不自然に感じられる時に見ればよい。

## checklist の変更

checklist（[`checklist.md`](../../.claude/skills/night-watch/checklist.md)）の変更は通常の PR レビューを通す。night-watch 自身（Actions workflow・手動代行のどちらも）はこのファイルを読むだけで編集しない（review-gated ratchet）。baseline 機構（`baseline.json`）は v4（#2543）で廃止した。

## 撤退条件

#2205 決定コメントに記載の観点を、月次ガーデニングで判定する（v4 で運行記録コメントが無くなったため、実績の材料は起票された alert issue と Actions の run 履歴）:

- 夜勤起票 issue の誤検知（朝の triage で invalid close）が継続的に発生する
- checklist のメンテコストが、防いだ劣化を上回る
- night-watch job の失敗や権限境界のインシデントが常態化する
