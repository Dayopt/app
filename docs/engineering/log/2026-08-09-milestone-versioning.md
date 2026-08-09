---
status: frozen
date: 2026-08-09
---

# milestone を「次の minor version」単位で運用する

## 背景・当時の前提

- issue の状態管理はラベル + epic（sub-issues）で回っており、「重要か」（priority）は表せるが「**今回の押し込みに入っているか**」を表す次元が無かった
- content-operations.md は「リリースごとに blog の release 記事（en/ja）」を義務化していたが、v0.17.0〜v0.32.1 の 16 バージョンで記事ゼロ。粒度がリリース単位なのが solo 運用に合っていなかった
- ユーザーの要望: 内部リリースは毎回で進捗感を持ち、外部共有はまとめて判断ベースの「ひとくぎり」にしたい。維持作業は増やさない（AI の作業も減らせるなら減らす）

## 決定と理由

**GitHub Milestone を「次の minor version」（例: v0.33）単位で運用し、open は常に 1 個だけにする。**

- **名前は version 番号**。状態名やテーマ名は毎回の命名判断が要るのに対し、version は自動で決まりゼロコスト。既存のリリース基盤（releasing skill / GitHub Releases）とひとくぎりの単位が一致し、新概念が増えない
- **1 issue = 最大 1 milestone という GitHub の排他性**が「今回やる / バックログ」の二値を機械的に表す。dispatch は `--milestone <現行> --label status:ready` の 1 クエリで次の作業を得る
- **attach は Main（Fable）が dispatch intake の中で判断**（操作 B 手順 5）。人間の維持作業ゼロ。patch リリースは milestone を経由しない
- **世代交代は releasing skill Phase 3.1**: minor リリース時に閉じて次を開く。残った open issue は明示的に移すか外す
- **外部共有はリリース義務から milestone 締め時の判断に変更**（content-operations.md 更新）。公開ローンチ後に運用開始。過去 16 バージョンの backfill はしない
- **監査は dispatch 操作 C（sweep）に 1 項目追加**。月次 Routine が実行するため、milestone の腐敗は機械が拾う

## 却下した選択肢と、なぜ捨てたか

- **状態名 milestone（「課金開始できる」等）** — 毎サイクル命名判断が発生する。意味づけは issue タイトルと epic が既に持っており、version 名で失うものが無い
- **時間名 milestone（2026-08 等）** — 期限が過ぎても終わらない時に繰り越し作業が発生する。カレンダー駆動の成果物は腐る（月次ガーデニング 26 日停止の教訓と同型）
- **「next」milestone の併設** — 二重管理の温床。入らないものはバックログ（milestone なし）で表現できる
- **固定 N 件での外部共有自動発火** — 個数で切ると changelog の味になる。発火提案は機械、判断は人間に置く

## 運用メモ

- 初代 milestone `v0.33` の作成はローカルで実施: `gh api repos/Dayopt/dayopt/milestones -f title=v0.33`（remote 環境に milestone 作成手段が無いため初回のみ手動。以後は Phase 3.1 が作る）
- minor 番号が予定とずれた場合（先に別の minor が出た等）は milestone を rename するだけでよい
