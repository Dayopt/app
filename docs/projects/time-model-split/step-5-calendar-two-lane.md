---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/calendar/components/views
  - apps/product/src/features/timeblock/types/calendar-event.ts
---

# Step 5: Calendar 2レーン表示（read 側）

overview §4 の 2レーン構成（Log 主役・Plan 控えめ）を、既存 entries 表示を壊さず**新レンダリング系として**実装する。既存ビューへの接続は Step 8 のフリップで行い、それまで Storybook と開発用確認で検証する。

## Goal

plans / logs を Plan レーン + Log レーンとして描画し、差分を数字で見せる Calendar の read 側を完成させる。

## Minimum Viable Approach

1. 射影型: 現行 `CalendarEvent`（`features/timeblock/types/calendar-event.ts`）を `PlanEvent` / `RecordEvent` に分割する。plan 側は `skipped_at` / 記録済みか（logs の有無）、log 側は `plan_id` / 差分分を持つ
2. レーン描画: 日カラムを Plan レーンと Log レーンに分割。**Log = 塗りカード（主役）、Plan = アウトライン・淡色**。現行 `EntryRenderer` の配置ロジック（時間 → 座標）は流用し、レーンごとの幅計算だけ追加する
3. 差分の数字表示: `plan_id` ありの log に差分バッジ（±0 は非表示）。`plan_id` なしは「予定外」の静かなマーカーのみ。二値ラベルは使わない（copywriting「判定せず数字で示す」）
4. 密度対応: Day = 2レーン、Week「予定+記録」= Plan を細レーン、モバイル Week = 表示切替（予定だけ / 記録だけ）。表示モードは `useCalendarSettingsStore` 系の既存 client state 置き場に追加する
5. 過去 Plan の見え方: 未記録（end 過去・logs なし・未 skip）は静かなプロンプト付き、skip 済みは減衰表示。実績集計との整合は overview §3 の分類に従う
6. Storybook: PlanCard / LogCard / 2レーン day column の全 variant（AllPatterns 必須）。視覚確認は Storybook 本体で行う（Eagle への snapshot 同期は 2026-07-23 に廃止）

## Scope

追加する: 射影型、レーン描画コンポーネント、差分バッジ、表示モード state、stories。
追加しない: 既存ビューへの接続（Step 8）、作成・編集フロー（Step 6）、DnD の保存先判定（Step 6）、Review パネル（Step 7）。

## Reversibility Table

| Step                    | Tag       | 備考                     |
| ----------------------- | --------- | ------------------------ |
| 新レンダリング系の追加  | [minutes] | 未接続。revert で消せる  |
| 表示モード state の追加 | [minutes] | persist キーを増やすだけ |

## Existing Code to Reuse

- `apps/product/src/features/calendar/components/views/shared/components/EntryRenderer.tsx` — 時間 → 座標の配置ロジック
- `TimeblockCard.tsx` / `TimeblockCardContent.tsx`（当時 `features/timeblock/components/card/`。live 描画が PlanLaneCard / RecordLaneCard へ完全移行したため 2026-08 に削除済み）— カードの構造・token 使用の踏襲元
- `apps/product/src/features/timeblock/lib/actual-time-overlay.ts` — 旧・差分オーバーレイ（置き換え対象の仕様参照。数字バッジ移行で廃止予定）
- `apps/product/src/features/calendar/stores/useCalendarFilterStore.ts` — タグ表示切替（レーンとは直交に維持）
- project skills: `storybook` / `i18n`

## What I'm Not Doing

- 既存の単一レーン + compare rail（Diff Rail）の削除はしない（Step 8 で接続を切り替え、Step 9 で削除）
- ghost（外部イベント）レーンは描画しない（Phase 2）

## Follow-up

次は Step 6（作成・編集フロー）。本 Step のレーンが DnD の保存先判定の受け皿になる。
