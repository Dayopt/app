import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Entry Inspector 状態管理
 *
 * entries テーブルに対応。全フィールドはデバウンス即時保存。
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
  /** 対象エントリのID */
  entryId: string | null;
  /** Inspector のアンカー位置（クリックされたブロックの位置） */
  anchorRect: AnchorRect | null;
}

/**
 * Entry Inspector Store のアクション
 */
interface EntryInspectorActions {
  /** Inspector を開く */
  openInspector: (entryId: string) => void;
  /** Inspector を閉じる */
  closeInspector: () => void;
  /** アンカー位置を設定 */
  setAnchorRect: (rect: AnchorRect) => void;
}

/**
 * Entry Inspector Store 型
 */
type EntryInspectorStore = EntryInspectorState & EntryInspectorActions;

/** Entry Inspector の開閉状態・対象エントリIDを管理するストア */
export const useEntryInspectorStore = create<EntryInspectorStore>()(
  devtools(
    (set) => ({
      isOpen: false,
      entryId: null,
      anchorRect: null,

      setAnchorRect: (rect) => set({ anchorRect: rect }, false, 'setAnchorRect'),

      openInspector: (entryId) =>
        set(
          {
            isOpen: true,
            entryId,
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
