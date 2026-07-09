---
status: current
last_verified: 2026-07-09
code:
  - apps/product/src/features/calendar/stores/useInlineCreateStore.ts
  - apps/product/src/features/calendar/stores/useCalendarDragStore.ts
  - apps/product/src/features/entry/components
---

# Step 6: 作成・編集フロー（保存先ルール・記録導線）

overview §4 の「保存先は end で一意に決まる」ルールと Plan → Log の 3 導線を実装する。Step 3 の plans / logs router を消費する最初の UI。既存ビューへの接続は Step 8。

## Goal

作成・編集・記録のすべての操作が、保存先の選択を要求せず、時間ルール（ADR-015 / 未来記録禁止）と一貫して動く状態にする。

## Minimum Viable Approach

1. **共有エディタ**: Plan / Log でフォームを共有し、destination チップ（「予定として保存 / 記録として保存」）を常時表示する。チップはセレクタではなく**表示**: `end_at > now` → Plan、`end_at <= now` → Log。時間編集で境界をまたいだ瞬間に色・ラベルが切り替わる
2. 作成導線:
   - ドラッグ作成: レーンが保存先を決める（Plan レーンでドラッグ = Plan、Log レーンでドラッグ = Log）。ただし end ルールと矛盾する操作（Log レーンで未来をドラッグ等）は end ルールが勝ち、チップで可視化する
   - タグクリック作成: 今の時刻から始まるドラフト（end 未来 = Plan 表示）。時間を過去に編集すると Log に自動切替
3. 記録導線（3つ）:
   - ワンタップ「そのまま記録」（`plans.record`）: past plan のカード / Inspector から 1 タップ
   - Plan カードを Log レーンへドラッグ = そのまま記録、ドロップ後リサイズ = ずれ込みで記録
   - 一括「この日を確定」（`plans.confirmDay`）: 日ヘッダー等に配置。未記録 past plans をまとめて log 化
4. **過去 Plan の操作制約**（ADR-015 マトリクス）: 時間変更・移動・リサイズは disabled、title / tag / note 編集・記録・skip・削除は許可。UI disabled + service ガード（Step 3）の二重防御（temporal-constraints ルール踏襲）。end が未来の Plan は自由編集可、ただし end を過去へ縮める操作は不可
5. mutation は `optimistic-update` skill に従い onMutate / onError / onSettled を実装。EXCLUDE 衝突（TIME_OVERLAP）はロールバック + トースト
6. 文言: ボタンは体言止め、トーストは「記録しました ✓」等 copywriting ルール準拠。i18n キーを en / ja 両方に追加

## Scope

追加する: 共有エディタ + チップ、作成・記録導線、過去 Plan 制約 UI、optimistic update、i18n、stories / tests。
追加しない: 既存ビューへの接続（Step 8）、Review（Step 7）、Plan ⇄ Log 相互変換 UI（Step 3 で procedure ごと不採用）。

## Reversibility Table

| Step                 | Tag       | 備考                    |
| -------------------- | --------- | ----------------------- |
| エディタ・導線の追加 | [minutes] | 未接続。revert で消せる |
| i18n キー追加        | [minutes] | 追加のみ                |

## Existing Code to Reuse

- `apps/product/src/features/calendar/stores/useInlineCreateStore.ts` / `useCalendarDragStore.ts` — インライン作成・ドラッグの既存 state（レーン概念の追加ベース）
- `apps/product/src/features/entry/stores/`（Inspector store）— 開閉・対象参照のパターン
- `apps/product/src/features/calendar/stores/useEntryClipboardStore.ts` — コピー / ペースト（保存先ルールを適用して流用）
- `.claude/rules/temporal-constraints.md` — 過去ブロック操作制約の UI + ロジック二重防御パターン
- project skills: `optimistic-update` / `i18n` / `storybook` / `test`

## What I'm Not Doing

- タイマー（開始 / 停止）UI は作らない。「さっきまでやっていた」は end = 今 の Log 作成で表現でき、Toggl 型の能動ボタンは ADR-019 のコンテキストで否定済みの体験
- skip の高度な UI（理由入力等）はしない。skip / unskip の 1 アクションのみ

## Follow-up

次は Step 7（Review 差分の再定義）。並行可能だが、差分バッジ（Step 5）と分類ロジックを共有するため先に Step 5 をマージしておく。
