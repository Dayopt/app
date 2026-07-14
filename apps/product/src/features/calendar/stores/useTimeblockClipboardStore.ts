'use client';

import type { ClipboardTimeblock } from '@/features/timeblock';
import { create } from 'zustand';

export type { ClipboardTimeblock } from '@/features/timeblock';

/**
 * 最後にクリックした日付（Googleカレンダー互換のペースト用）
 * 時刻はコピー元のものを使用するため、日付のみ記憶
 */
interface LastClickedPosition {
  date: Date;
}

interface TimeblockClipboardState {
  /** コピーされたエントリ */
  copiedTimeblock: ClipboardTimeblock | null;
  /** 最後にクリックした位置（Cmd+Vでペーストする位置） */
  lastClickedPosition: LastClickedPosition | null;
}

interface TimeblockClipboardActions {
  /** エントリをクリップボードにコピー */
  copyTimeblock: (entry: ClipboardTimeblock) => void;
  /** クリップボードをクリア */
  clearClipboard: () => void;
  /** クリップボードにエントリがあるかチェック */
  hasCopiedTimeblock: () => boolean;
  /** 最後にクリックした位置を設定（Googleカレンダー互換のCmd+Vペースト用） */
  setLastClickedPosition: (position: LastClickedPosition) => void;
  /** 最後にクリックした位置をクリア */
  clearLastClickedPosition: () => void;
}

type TimeblockClipboardStore = TimeblockClipboardState & TimeblockClipboardActions;

/**
 * エントリクリップボードStore
 *
 * エントリのコピー＆ペースト機能用のクリップボード管理
 * - コピー: エントリの情報を保存
 * - ペースト: 保存された情報を使って新規エントリをドラフトモードで作成
 */
export const useTimeblockClipboardStore = create<TimeblockClipboardStore>((set, get) => ({
  // State
  copiedTimeblock: null,
  lastClickedPosition: null,

  // Actions
  copyTimeblock: (entry) => {
    set({ copiedTimeblock: entry });
  },

  clearClipboard: () => {
    set({ copiedTimeblock: null });
  },

  hasCopiedTimeblock: () => {
    return get().copiedTimeblock !== null;
  },

  setLastClickedPosition: (position) => {
    set({ lastClickedPosition: position });
  },

  clearLastClickedPosition: () => {
    set({ lastClickedPosition: null });
  },
}));
