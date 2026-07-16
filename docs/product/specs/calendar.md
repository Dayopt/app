---
status: current
last_verified: 2026-07-16
code: apps/product/src/features/calendar
---

# Calendar（カレンダー）

Plan（予定）とRecord（記録）を同じ時間軸で配置・閲覧する、Dayoptのプライマリ作業面。

## 現在の振る舞い

- Day / Week / Multi-Day（2〜9日）で、表示範囲と基準日をURLに保持する
- 各日カラムをPlanレーンとRecordレーンに分ける。Planは控えめなoutline、Recordは塗りで表示する
- モバイルはDay / Weekを提供する。Weekでは予定または記録を切り替えて日カラム全幅に表示し、最後に選んだ表示を端末へ保持する。既定は記録
- モバイルの検索、作成、Inspector、tag / 日時picker、振り返りpanelは[Mobile overlays](./mobile-overlays.md)のmodal性とdismiss契約に従う
- 新規作成時の保存先は`end_at > now`ならPlan、`end_at <= now`ならRecordとして自動決定し、既存Plan / Recordの編集では種別を維持する
- 15分gridへのsnap、dragによる移動・resize、keyboard操作、tag filterを提供する
- `?`キーまたはSidebar右端のヘルプメニューから、現在登録されているkeyboard shortcut一覧を背景overlayなしの横長2列で開く。操作行の区切り線は表示しない。キー表記は利用中platform、説明はlocaleに合わせる
- Calendarの時間軸、card、選択 / drag preview、Diff panelの時刻表示はユーザー設定の12時間 / 24時間表記に従う。Inspectorの入力・保存値は`HH:mm`を正とする
- scroll keyはfocus中のCalendar gridだけが処理し、入力、IME、menu / dialog中はglobal shortcutを実行しない
- hour gridとday dividerは内部線としてsubtleに表示し、同じ境界を重ねて描画しない
- Diffは符号と方向を数字・iconで示し、増減そのものをsuccess / destructive色で評価しない
- 過去Planの時間は凍結し、Recordの時間は訂正できる
- 既存カードのdrag previewは移動先のレーンと同じカードで表示する。Planはoutline、RecordとPlan→Recordの記録化previewは塗りで区別する
- 過去PlanをRecordレーンへdragすると、drop previewの時間帯で元Planに紐づくRecordを作る。元Planは移動せず、Record同士が重ならなければ同じPlanへ複数回記録できる
- 1つのPlanに複数のRecordがある場合、Calendarの差分は関連Recordの合計時間から計算し、代表するRecord card 1枚だけに表示する。`±0`は表示しない
- `panel=diff`では差分一覧の対象をcompare markerで通常cardにも示す。予定に対する記録・skip・未記録はPlan、予定外の記録はRecordを対象とし、関連Recordすべてへ重複表示しない
- 差分の正負は符号と方向iconで示し、成功・失敗を意味する色は使わない
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

- 検索はCalendar内の補助導線であり、独立pageやcommand paletteにはしない。desktopはSidebar、mobileは展開したmini calendarから開き、`Cmd/Ctrl+K`でも開ける。mobileでは検索欄とキャンセルを上部に固定した全高bottom sheetを使い、結果領域だけをscrollする
- 削除されていない全期間のPlan / Recordを、activeなtag名とメモの部分一致で検索する。skip済みPlanも履歴として含め、tag自体は結果にしない
- 空の検索語では取得せず、結果は開始日時の新しい順に20件まで表示する。検索履歴や最近使った項目は保存しない
- 結果にはPlan / Recordの別、表示名となるtag、メモの抜粋、日時を表示する。DB互換の`title`と内部IDは表示しない
- 結果を選ぶと対象日のCalendarへ移動し、URLで対象ブロックのInspectorを開く。検索結果内には複製などの副操作を置かない

## 関連する意思決定

- [検索対象と表示をtag・メモに揃え、結果は対象ブロックを開く操作に限定する](../log/2026-07-15-feedback-block-search-tag-note.md)
- [ADR-025: Plan / Record / 外部カレンダーミラーへの分割](../log/2026-07-09-time-model-split.md)
- [時間不変原則](../log/2026-03-10-time-immutability-principle.md)
- [機能スコープ](../log/2026-06-16-feature-non-adoption.md)
