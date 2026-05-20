'use client';

import { create } from 'zustand';

/**
 * クリップボードにコピーされたエントリの情報
 */
export interface ClipboardEntry {
  /** タイトル */
  title: string;
  /** 説明 */
  description: string | null;
  /** 期間（分単位） */
  duration: number;
  /** 開始時刻（時） */
  startHour: number;
  /** 開始時刻（分） */
  startMinute: number;
  /** タグID */
  tagId: string | null | undefined;
}

/**
 * 最後にクリックした日付（Googleカレンダー互換のペースト用）
 * 時刻はコピー元のものを使用するため、日付のみ記憶
 */
export interface LastClickedPosition {
  date: Date;
}

interface EntryClipboardState {
  /** コピーされたエントリ */
  copiedEntry: ClipboardEntry | null;
  /** 最後にクリックした位置（Cmd+Vでペーストする位置） */
  lastClickedPosition: LastClickedPosition | null;
}

interface EntryClipboardActions {
  /** エントリをクリップボードにコピー */
  copyEntry: (entry: ClipboardEntry) => void;
  /** クリップボードをクリア */
  clearClipboard: () => void;
  /** クリップボードにエントリがあるかチェック */
  hasCopiedEntry: () => boolean;
  /** 最後にクリックした位置を設定（Googleカレンダー互換のCmd+Vペースト用） */
  setLastClickedPosition: (position: LastClickedPosition) => void;
  /** 最後にクリックした位置をクリア */
  clearLastClickedPosition: () => void;
}

type EntryClipboardStore = EntryClipboardState & EntryClipboardActions;

/**
 * エントリクリップボードStore
 *
 * エントリのコピー＆ペースト機能用のクリップボード管理
 * - コピー: エントリの情報を保存
 * - ペースト: 保存された情報を使って新規エントリをドラフトモードで作成
 */
export const useEntryClipboardStore = create<EntryClipboardStore>((set, get) => ({
  // State
  copiedEntry: null,
  lastClickedPosition: null,

  // Actions
  copyEntry: (entry) => {
    set({ copiedEntry: entry });
  },

  clearClipboard: () => {
    set({ copiedEntry: null });
  },

  hasCopiedEntry: () => {
    return get().copiedEntry !== null;
  },

  setLastClickedPosition: (position) => {
    set({ lastClickedPosition: position });
  },

  clearLastClickedPosition: () => {
    set({ lastClickedPosition: null });
  },
}));
