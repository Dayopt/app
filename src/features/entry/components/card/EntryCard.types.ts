/**
 * EntryCard 専用の型定義
 */

import type { CalendarEvent } from '@/types/calendar-event';

export interface EntryCardProps {
  plan: CalendarEvent;
  position?: EntryCardPosition | undefined;
  onClick?: ((plan: CalendarEvent) => void) | undefined;
  onContextMenu?: ((plan: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onDragStart?:
    | ((
        plan: CalendarEvent,
        mouseEvent: React.MouseEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  /** モバイル用タッチ開始ハンドラー */
  onTouchStart?:
    | ((
        plan: CalendarEvent,
        touchEvent: React.TouchEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  onDragEnd?: ((plan: CalendarEvent) => void) | undefined;
  onResizeStart?:
    | ((
        plan: CalendarEvent,
        direction: 'top' | 'bottom',
        mouseEvent: React.MouseEvent,
        position: { top: number; left: number; width: number; height: number },
      ) => void)
    | undefined;
  onResizeEnd?: ((plan: CalendarEvent) => void) | undefined;
  isDragging?: boolean | undefined;
  isSelected?: boolean | undefined;
  isResizing?: boolean | undefined;
  /** Inspectorで開いているプランかどうか */
  isActive?: boolean | undefined;
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
  planId: string;
  startPosition: { x: number; y: number };
  originalStart: Date;
  originalEnd: Date;
}

export interface EntryResizeData {
  planId: string;
  resizeDirection: 'top' | 'bottom';
  originalStart: Date;
  originalEnd: Date;
}
