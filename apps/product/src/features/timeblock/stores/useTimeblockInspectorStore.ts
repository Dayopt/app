import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { TimeblockDestination } from '../domain/timeblock-destination';

/**
 * Timeblock Inspector 状態管理
 *
 * Plan / Record に対応。timeblockKind で対象を判別する。
 */

/** Inspector ポップオーバーのアンカー位置 */
export interface AnchorRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Timeblock Inspector Store の状態
 */
interface TimeblockInspectorState {
  /** Inspector が開いているか */
  isOpen: boolean;
  /** 対象エントリのID（plan または record の UUID） */
  timeblockId: string | null;
  /** 対象が plan / record のどちらか */
  timeblockKind: TimeblockDestination;
  /** Inspector のアンカー位置（クリックされたブロックの位置） */
  anchorRect: AnchorRect | null;
}

/**
 * Timeblock Inspector Store のアクション
 */
interface TimeblockInspectorActions {
  /** Inspector を開く */
  openInspector: (timeblockId: string, kind?: TimeblockDestination) => void;
  /** Inspector を閉じる */
  closeInspector: () => void;
  /** アンカー位置を設定 */
  setAnchorRect: (rect: AnchorRect) => void;
}

/**
 * Timeblock Inspector Store 型
 */
type TimeblockInspectorStore = TimeblockInspectorState & TimeblockInspectorActions;

/** Timeblock Inspector の開閉状態・対象Timeblock ID・kind を管理するストア */
export const useTimeblockInspectorStore = create<TimeblockInspectorStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      timeblockId: null,
      timeblockKind: 'plan',
      anchorRect: null,

      setAnchorRect: (rect) => set({ anchorRect: rect }, false, 'setAnchorRect'),

      openInspector: (timeblockId, kind = 'plan') =>
        set(
          {
            isOpen: true,
            timeblockId,
            timeblockKind: kind,
          },
          false,
          'openInspector',
        ),

      closeInspector: () => {
        // カレンダーのドラッグ選択をクリア
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('calendar-drag-cancel'));
        }
        set(
          {
            isOpen: false,
            timeblockId: null,
            timeblockKind: 'plan',
            anchorRect: null,
          },
          false,
          'closeInspector',
        );
      },
    }),
    { name: 'timeblock-inspector-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
