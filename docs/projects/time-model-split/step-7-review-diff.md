---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/calendar/lib/day-diff.ts
  - apps/product/src/features/review/components/diff/ReviewDiffPanel.tsx
  - apps/product/src/features/review/hooks/useReviewPageData.ts
---

# Step 7: Review 差分の再定義（1:N 対応）

`computeCalendarDayDiffs` を plans + logs の 1:N 前提で再定義し、Review パネル / Time P/L を新統計 service（Step 4）に載せ替える。接続フリップは Step 8。

## Goal

overview §3 の 4 分類（未記録 / やらなかった / 予定に対する記録 / 予定外）+ 差分数字で、日次・週次の Review が成立する状態にする。

## 決めること（overview §8 未決 1・2・3）

- **未決 1 — 別日実行の帰属（推奨: log は log の日、plan は自分の日）**: 火曜の予定に紐づく水曜の log は、水曜の実績に計上し、火曜側は「未達（記録は水曜）」として出す。日をまたいで実績を移動させると日次サマリーの合計が崩れるため
- **未決 2 — tag / title 乖離時の束ね（推奨: log 側優先）**: 実績集計・Time P/L は log の tag で束ねる。予定系集計（blank rate / budget）だけ plan の tag を読む。「実際に何が起きたか」が主役という製品方針と一致
- **未決 3 — plan soft delete 時の紐づき logs（推奨: 予定外に落とす）**: log は残し `plan_id` も保持するが、Review 上は生きている plan への join が取れないため「予定外の記録」として表示する。復元すれば自動的に「予定に対する記録」へ戻る

## Minimum Viable Approach

1. `day-diff.ts` を再定義: 入力を (plans[], logs[]) に変更。分類は overview §3 の 4 分類。現行の shifted / resized は「plan と Σlogs の開始ずれ・長さ差」として plan 単位で再定義する（1:N では log 単位の shifted は定義しない）
2. summary の再定義: `plannedMinutes` = Σplans（skip 除外の扱いは現行踏襲: 計画履歴には残す・実績には混ぜない）、`actualMinutes` = Σlogs、`diffMinutes`、`unplannedMinutes`、`unrecordedMinutes`（新設: 未記録 plan の合計）
3. `ReviewDiffPanel` / compare rail: 新 shape に追随。差分は数字（±0 非表示）、判定ラベル・赤マークなし（review spec「判定しない」）
4. `useReviewPageData` / Time P/L: Step 4 の statistics-service が返す新 shape に載せ替え（接続自体は Step 8 まで分岐せず、旧実装と並存）
5. 比較テスト: backfill 済みデータで旧 day-diff と新 day-diff のサマリーを突合し、意味論差（auto-record 実体化・未記録の新設）を許容リスト化する

## Scope

追加する: day-diff 再定義、Review コンポーネントの新 shape 対応、unrecorded 分類、tests。
追加しない: 接続フリップ（Step 8）、旧 day-diff の削除（Step 9）、Review の情報設計変更（2タブ構成などの未決は本 project のスコープ外）。

## Reversibility Table

| Step            | Tag       | 備考                                                                                                   |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| day-diff 再定義 | [minutes] | 旧実装と並存。revert で消せる                                                                          |
| 未決 1-3 の決定 | [hours]   | 表示解釈のみでデータ非破壊。後から変えられるが、ユーザーが見る数字の意味が変わるため変更時は告知が要る |

## Existing Code to Reuse

- `apps/product/src/features/calendar/lib/day-diff.ts` — 分類・summary の再定義ベース
- `apps/product/src/features/review/components/diff/ReviewDiffPanel.tsx` + stories — パネルの shape 契約
- `apps/product/src/features/review/domain/`（timePL / variance）— 予実比較の既存 domain
- `apps/product/src/features/timeblock/domain/estimation-accuracy.ts` — 1:N 化の改修ベース（Step 4 と共有）

## What I'm Not Doing

- スコア・ストリーク・判定表示の追加はしない（review spec「判定しない」）
- 月次・年次集計の復活はしない（core-slim 方針）

## Follow-up

次は Step 8（カットオーバー）。Step 4-7 の dormant 実装が揃っていることが前提。
