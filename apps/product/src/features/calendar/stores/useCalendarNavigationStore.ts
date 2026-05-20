/**
 * カレンダー日付ナビゲーションストア
 *
 * 2つの役割:
 * 1. **コマンドチャネル**: 外部機能（検索等）→ カレンダーへのナビゲーション要求
 *    - pendingDate / navigateTo / clearPending
 * 2. **読み取り専用ミラー**: CalendarNavigationContext → store（一方向同期）
 *    - viewedDate / viewType（Context が唯一の source of truth）
 *    - カレンダーページ外の機能（useBlockPlace等）がカレンダー状態を参照するため
 *
 * ⚠ viewedDate / viewType を直接変更しないこと。
 *   CalendarNavigationContext の useEffect が自動同期する。
 */

import { create } from 'zustand';

import type { CalendarViewType } from '../lib/constants';

interface CalendarNavigationStore {
  // ── コマンドチャネル（外部 → カレンダー） ──
  /** ナビゲーション待ちの日付 */
  pendingDate: Date | null;
  /** 日付ナビゲーションを要求 */
  navigateTo: (date: Date) => void;
  /** 要求をクリア（カレンダー側が消費後に呼ぶ） */
  clearPending: () => void;

  // ── 読み取り専用ミラー（CalendarNavigationContext → store） ──
  /** カレンダーが現在表示している日付（読み取り専用 — Context が権威） */
  viewedDate: Date;
  /** カレンダーの表示ビュータイプ（読み取り専用 — Context が権威） */
  viewType: CalendarViewType;

  // ── 内部同期用（CalendarNavigationContext のみが呼ぶ） ──
  /** @internal Context → store 同期用 */
  _syncViewedDate: (date: Date) => void;
  /** @internal Context → store 同期用 */
  _syncViewType: (viewType: CalendarViewType) => void;
}

/** カレンダーの日付ナビゲーションを仲介するZustandストア */
export const useCalendarNavigationStore = create<CalendarNavigationStore>()((set) => ({
  pendingDate: null,
  viewedDate: new Date(),
  viewType: 'week',
  navigateTo: (date) => set({ pendingDate: date }),
  clearPending: () => set({ pendingDate: null }),
  _syncViewedDate: (date) => set({ viewedDate: date }),
  _syncViewType: (viewType) => set({ viewType }),
}));
