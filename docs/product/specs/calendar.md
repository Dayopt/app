---
status: current
last_verified: 2026-07-15
code: apps/product/src/features/calendar
---

# Calendar（カレンダー）

Plan（予定）とRecord（記録）を同じ時間軸で配置・閲覧する、Dayoptのプライマリ作業面。

## 現在の振る舞い

- Day / Week / Multi-Day（2〜9日）で、表示範囲と基準日をURLに保持する
- 各日カラムをPlanレーンとRecordレーンに分ける。Planは控えめなoutline、Recordは塗りで表示する
- 新規作成時の保存先は`end_at > now`ならPlan、`end_at <= now`ならRecordとして自動決定し、既存Plan / Recordの編集では種別を維持する
- 15分gridへのsnap、dragによる移動・resize、keyboard操作、tag filterを提供する
- 過去Planの時間は凍結し、Recordの時間は訂正できる
- 過去PlanをRecordレーンへdragすると、drop previewの時間帯で元Planに紐づくRecordを作る。元Planは移動せず、Record同士が重ならなければ同じPlanへ複数回記録できる
- 1つのPlanに複数のRecordがある場合、Calendarの差分は関連Recordの合計時間から計算し、代表するRecord card 1枚だけに表示する。`±0`は表示しない
- `panel=review` / `panel=diff`で単一の右panel slotを開く。panel UIはReview featureが所有し、Calendarは表示範囲とcompositionを所有する
- Diffの対象期間はCalendarの現在viewを正とし、day / week / multi-dayの範囲をそのまま使う

## Stateの正本

- view、date、panel、review tag: URL + `CalendarNavigationContext`
- server data: tRPC + TanStack Query
- drag、filter、scroll等の一時表示状態: Calendar内のZustand store
- feature間の合成: `apps/product/src/app/**/_composition/`

実装上のdata flowと依存境界は[Engineering Architecture](../../engineering/architecture.md)、component variantはStorybookを参照する。

## 関連する意思決定

- [ADR-025: Plan / Record / 外部カレンダーミラーへの分割](../log/2026-07-09-time-model-split.md)
- [時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [機能スコープ](../log/2026-06-16-feature-non-adoption.md)
