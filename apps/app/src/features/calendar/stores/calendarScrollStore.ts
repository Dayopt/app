import type { CalendarViewType } from '../types/calendar.types';

/**
 * カレンダーのスクロール位置を管理するモジュール
 *
 * Zustandストアを使わずにモジュールスコープのMapとlocalStorageで管理する。
 * スクロール位置はリアクティブである必要がない（ナビゲーション後の復元時に命令的に読み取るだけ）。
 */

const STORAGE_KEY = 'calendar-scroll-positions';

/** ランタイムスクロール位置キャッシュ */
const scrollPositions = new Map<CalendarViewType, number>();

function loadFromStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, number>;
    for (const [view, pos] of Object.entries(parsed)) {
      scrollPositions.set(view as CalendarViewType, pos);
    }
  } catch {
    // 破損データは無視
  }
}

function saveToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, number> = {};
    scrollPositions.forEach((pos, view) => {
      obj[view] = pos;
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ストレージエラーは無視
  }
}

// モジュールロード時にlocalStorageから復元
loadFromStorage();

/** 特定ビューのスクロール位置を取得（未設定の場合は0） */
export function getScrollPosition(view: CalendarViewType): number {
  return scrollPositions.get(view) ?? 0;
}

/** 特定ビューのスクロール位置を保存 */
export function setScrollPosition(view: CalendarViewType, position: number): void {
  scrollPositions.set(view, position);
  saveToStorage();
}

/** 全ビューのスクロール位置をリセット */
export function resetScrollPositions(): void {
  scrollPositions.clear();
  saveToStorage();
}
