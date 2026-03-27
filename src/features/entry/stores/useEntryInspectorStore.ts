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
 * アンカー位置のモジュールスコープRef
 *
 * anchorRect はレイアウト計算用のため、リアクティブである必要がない。
 * Zustandストアから分離し、不要な再レンダリングを防止する。
 *
 * 書き込み: CalendarGridContent / DayColumn（カードクリック時）
 * 読み取り: EntryInspector（FloatingPopover配置計算時）
 */
export const inspectorAnchorRef: { current: AnchorRect | null } = { current: null };

/** アンカー位置を設定（PlanCard クリック時に呼ぶ） */
export function setInspectorAnchorRect(rect: AnchorRect): void {
  inspectorAnchorRef.current = rect;
}

/** アンカー位置をクリア */
export function clearInspectorAnchorRect(): void {
  inspectorAnchorRef.current = null;
}

/**
 * Entry Inspector Store の状態
 */
interface EntryInspectorState {
  /** Inspector が開いているか */
  isOpen: boolean;
  /** 対象エントリのID */
  entryId: string | null;
}

/**
 * Entry Inspector Store のアクション
 */
interface EntryInspectorActions {
  /** Inspector を開く */
  openInspector: (entryId: string) => void;
  /** Inspector を閉じる */
  closeInspector: () => void;
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
        clearInspectorAnchorRect();
        set(
          {
            isOpen: false,
            entryId: null,
          },
          false,
          'closeInspector',
        );
      },
    }),
    { name: 'entry-inspector-store', enabled: process.env.NODE_ENV !== 'production' },
  ),
);
