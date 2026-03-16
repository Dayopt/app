/**
 * EntryCard 専用の型定義
 */

import type { CalendarEvent } from '@/types/calendar-event';

import type { AnchorRect } from '../../stores/useEntryInspectorStore';

export interface EntryCardProps {
  /** エントリデータ */
  entry: CalendarEvent;
  /** 解決済みタグ名（null = タグ未設定） */
  tagName?: string | null | undefined;
  /** 解決済みタグカラー名（null = デフォルト色） */
  tagColor?: string | null | undefined;
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
        mouseEvent: React.MouseEvent,
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
}

export interface EntryCardPosition {
  top: number; // px
  left: number; // %
  width: number; // %
  height: number; // px
  zIndex?: number;
}

export interface EntryInteractionState {
  isSelected: boolean;
  isDragging: boolean;
  isResizing: boolean;
}

export interface EntryDragData {
  entryId: string;
  startPosition: { x: number; y: number };
  originalStart: Date;
  originalEnd: Date;
}

export interface EntryResizeData {
  entryId: string;
  resizeDirection: 'top' | 'bottom';
  originalStart: Date;
  originalEnd: Date;
}
