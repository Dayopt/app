/**
 * EntryCard 専用の型定義
 */

import type { CalendarEvent } from '../../types/calendar-event';

import type { AnchorRect } from '../../stores/useEntryInspectorStore';

/** EntryCardコンポーネントのPropsをまとめた型 */
export interface EntryCardProps {
  /** エントリデータ */
  entry: CalendarEvent;
  /** 解決済みタグ名（null = タグ未設定） */
  tagName?: string | null | undefined;
  /** 解決済みタグカラー名（null = デフォルト色） */
  tagColor?: string | null | undefined;
  /** 解決済みタグアイコン名（null = アイコンなし） */
  tagIcon?: string | null | undefined;
  position?: EntryCardPosition | undefined;
  onClick?: ((entry: CalendarEvent) => void) | undefined;
  onContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onDragStart?:
    | ((
        entry: CalendarEvent,
        mouseEvent: React.MouseEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  /** モバイル用タッチ開始ハンドラー */
  onTouchStart?:
    | ((
        entry: CalendarEvent,
        touchEvent: React.TouchEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  onDragEnd?: ((entry: CalendarEvent) => void) | undefined;
  onResizeStart?:
    | ((
        entry: CalendarEvent,
        direction: 'top' | 'bottom',
        event: React.MouseEvent | React.TouchEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  onResizeEnd?: ((entry: CalendarEvent) => void) | undefined;
  /** Inspector のアンカー位置を設定するコールバック */
  onAnchorRect?: ((rect: AnchorRect) => void) | undefined;
  isDragging?: boolean | undefined;
  isSelected?: boolean | undefined;
  isResizing?: boolean | undefined;
  /** Inspector で開いているエントリかどうか */
  isActive?: boolean | undefined;
  /** モバイルレイアウト */
  isMobile?: boolean | undefined;
  className?: string | undefined;
  style?: React.CSSProperties | undefined;
  previewTime?: ({ start: Date; end: Date } | null) | undefined;
  /** グリッドの1時間あたりの高さ（px）。予定vs記録の差分オーバーレイ計算に使用 */
  hourHeight?: number | undefined;
  /** 予定と実績の差分レイヤーを表示する（multi-column drag 用） */
  showActualDiff?: boolean | undefined;
  /** day compare Rail に出ている entry の marker を表示する */
  showDayDiffMarker?: boolean | undefined;
  /** 予定レイヤーとして扱う高さ。actual 側の高さと分ける場合に使用 */
  plannedHeight?: number | undefined;
  /** 外部（WeekContent等）がwrapper側でoverlay位置調整済みの場合true。EntryCard内でのtopShift/heightDelta適用をスキップする */
  overlayPositionApplied?: boolean | undefined;
  /** 空き枠（unexecuted）クリック時のコールバック。引数は空き時間の開始・終了（分 of day） */
  onGapClick?: ((startMinutes: number, endMinutes: number) => void) | undefined;
  /** 空き枠が既に別の記録で埋まっている場合などに、gap 作成導線を隠す */
  isGapAvailable?: ((startMinutes: number, endMinutes: number) => boolean) | undefined;
  /** 空き枠クリックを許可する上限時刻。未来の予定外記録作成を防ぐために使用 */
  gapCreationCutoffMs?: number | undefined;
}

/** カレンダーグリッド上のEntryCardの位置情報（top/left/width/heightはpx or %） */
export interface EntryCardPosition {
  top: number; // px
  left: number; // %
  width: number; // %
  height: number; // px
  zIndex?: number;
}
