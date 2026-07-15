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
- 作成・編集時の保存先は`end_at > now`ならPlan、`end_at <= now`ならRecordとして自動決定する
- 15分gridへのsnap、dragによる移動・resize、keyboard操作、tag filterを提供する
- Calendarの時間軸、card、選択 / drag preview、Diff panelの時刻表示はユーザー設定の12時間 / 24時間表記に従う。Inspectorの入力・保存値は`HH:mm`を正とする
- scroll keyはfocus中のCalendar gridだけが処理し、入力、IME、menu / dialog中はglobal shortcutを実行しない
- hour gridとday dividerは内部線としてsubtleに表示し、同じ境界を重ねて描画しない
- Diffは符号と方向を数字・iconで示し、増減そのものをsuccess / destructive色で評価しない
- 過去Planの時間は凍結し、Recordの時間は訂正できる
- `panel=review` / `panel=diff`で単一の右panel slotを開く。panel UIはReview featureが所有し、Calendarは表示範囲とcompositionを所有する
- Review / Time P/Lの集計対象日はCalendarの表示日配列を正とし、週末非表示時は範囲内の土日を含めない
- Diffの対象期間はCalendarの現在viewを正とし、day / week / multi-dayの範囲をそのまま使う

## Stateの正本

- view、date、panel、review tag: URL + `CalendarNavigationContext`
- server data: tRPC + TanStack Query
- drag、filter、scroll等の一時表示状態: Calendar内のZustand store
- feature間の合成: `apps/product/src/app/**/_composition/`

実装上のdata flowと依存境界は[Engineering Architecture](../../engineering/architecture.md)、component variantはStorybookを参照する。

## ブロック検索

- 検索はCalendar内の補助導線であり、独立pageやcommand paletteにはしない。desktopはSidebar、mobileは展開したmini calendarから開き、`Cmd/Ctrl+K`でも開ける
- 削除されていない全期間のPlan / Recordを、タイトル・メモ・tag名の部分一致で検索する。skip済みPlanも履歴として含め、tag自体は結果にしない
- 空の検索語では取得せず、結果は開始日時の新しい順に20件まで表示する。検索履歴や最近使った項目は保存しない
- 結果にはPlan / Recordの別、tag、タイトル、メモの抜粋、日時を表示し、内部IDは表示しない
- 結果を選ぶと対象日のCalendarへ移動し、URLで対象ブロックのInspectorを開く。コピー操作は移動せず、再利用する内容だけをDayopt内clipboardへ渡す

## 関連する意思決定

- [ブロック検索を履歴の確認と再利用に限定する](../log/2026-07-15-feedback-block-search.md)
- [ADR-025: Plan / Record / 外部カレンダーミラーへの分割](../log/2026-07-09-time-model-split.md)
- [時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [機能スコープ](../log/2026-06-16-feature-non-adoption.md)
