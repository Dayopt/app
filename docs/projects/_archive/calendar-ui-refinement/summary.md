---
status: current
last_verified: 2026-07-30
code:
  - apps/product/src/lib/stores/useShellStore.ts
  - apps/product/src/features/calendar/lib/two-lane-layout.ts
---

# calendar-ui-refinement 完了サマリー

Calendar shell の完成度を上げた。新しいデザイン primitive は追加せず、既存の token と formatter の範囲で幅の協調・多日表示の可読性・右パネルの階層を整えた。

## 完了した契約

- `useShellStore` に永続しない `sidebarSuppressed` を追加し、右 rail の開閉やリサイズが永続設定の `sidebar.open` を書き換えないようにした。`CalendarLayout` が 5 段階の space recovery 状態機械（`idle` / `suppressing` / `suppressed` / `restoring-inline` / `restoring-sheet`）と rail を考慮した inline / sheet の分岐を持つ
- day / week / multi-day が `two-lane-layout.ts` の `DEFAULT_PLAN_LANE_WIDTH_PERCENT = 38` を共有し、week / multi-day で Plan lane が 20% まで潰れる問題を解消した
- Review / タグ詳細パネルの遷移が現在の Calendar view を保ち、集計範囲を表示中の列に合わせる。週末非表示の week でも同じ期間を使う（`e33a40ce9`）。multi-day の範囲は 2〜7 日に収束させた（`4b3c2f6e7`）
- 仕上げとして 12/24 時間設定を grid・下書きプレビュー・two-lane カード・衝突オーバーレイに通し、内部の線を `border-border-subtle` に寄せ、Diff の色を通常カードと Review で統一した（`3937861fd`）
- 時間・duration の formatter を `lib/date/formatDurationMinutes` に集約し、characterization test で挙動を固定した（`488ff33f5`, `899a16ba1`）

## 受入条件との差分

overview の方針 4 は Review summary を「ひとつの静かな data list」にすることを挙げていた。実装は border を外した `MetricCard` を 2 列（狭い rail）/ 4 列で並べる形に落ち着いており、文字どおりの data list ではない。受入条件の「三分割 card による label の不要な省略」は border 撤去と 2 列化で解消したため、この形を最終形とする。

詳細な設計と観察された問題は [overview](./overview.md) を参照する。
