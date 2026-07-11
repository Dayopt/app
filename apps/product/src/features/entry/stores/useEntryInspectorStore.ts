import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type { TimeModelDestination } from '../domain/time-model-destination';

/**
 * Entry Inspector 状態管理
 *
 * plans / logs（time model）に対応。entryKind で対象テーブルを判別する。
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
 * Entry Inspector Store の状態
 */
interface EntryInspectorState {
  /** Inspector が開いているか */
  isOpen: boolean;
  /** 対象エントリのID（plan または log の UUID） */
  entryId: string | null;
  /** 対象が plan / log のどちらか */
  entryKind: TimeModelDestination;
  /** Inspector のアンカー位置（クリックされたブロックの位置） */
  anchorRect: AnchorRect | null;
}

/**
 * Entry Inspector Store のアクション
 */
interface EntryInspectorActions {
  /** Inspector を開く */
  openInspector: (entryId: string, kind?: TimeModelDestination) => void;
  /** Inspector を閉じる */
  closeInspector: () => void;
  /** アンカー位置を設定 */
  setAnchorRect: (rect: AnchorRect) => void;
}

/**
 * Entry Inspector Store 型
 */
type EntryInspectorStore = EntryInspectorState & EntryInspectorActions;

/** Entry Inspector の開閉状態・対象エントリID・kind を管理するストア */
export const useEntryInspectorStore = create<EntryInspectorStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      entryId: null,
      entryKind: 'plan',
      anchorRect: null,

      setAnchorRect: (rect) => set({ anchorRect: rect }, false, 'setAnchorRect'),

      openInspector: (entryId, kind = 'plan') =>
        set(
          {
            isOpen: true,
            entryId,
            entryKind: kind,
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
            entryId: null,
            entryKind: 'plan',
            anchorRect: null,
          },
          false,
          'closeInspector',
        );
      },
    }),
    { name: 'entry-inspector-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
