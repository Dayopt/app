import { beforeEach, describe, expect, it } from 'vitest';

import type { ClipboardEntry } from '../useEntryClipboardStore';
import { useEntryClipboardStore } from '../useEntryClipboardStore';

const mockEntry: ClipboardEntry = {
  title: 'テストエントリ',
  description: '説明文',
  duration: 60,
  startHour: 10,
  startMinute: 0,
  tagId: 'tag-1',
};

describe('useEntryClipboardStore', () => {
  beforeEach(() => {
    useEntryClipboardStore.getState().clearClipboard();
    useEntryClipboardStore.getState().clearLastClickedPosition();
  });

  describe('初期状態', () => {
    it('クリップボードが空', () => {
      const state = useEntryClipboardStore.getState();
      expect(state.copiedEntry).toBeNull();
      expect(state.lastClickedPosition).toBeNull();
    });

    it('hasCopiedEntryがfalse', () => {
      expect(useEntryClipboardStore.getState().hasCopiedEntry()).toBe(false);
    });
  });

  describe('copyEntry', () => {
    it('エントリをコピーできる', () => {
      useEntryClipboardStore.getState().copyEntry(mockEntry);
      expect(useEntryClipboardStore.getState().copiedEntry).toEqual(mockEntry);
    });

    it('hasCopiedEntryがtrueになる', () => {
      useEntryClipboardStore.getState().copyEntry(mockEntry);
      expect(useEntryClipboardStore.getState().hasCopiedEntry()).toBe(true);
    });

    it('上書きコピーできる', () => {
      useEntryClipboardStore.getState().copyEntry(mockEntry);
      const newEntry = { ...mockEntry, title: '新しいエントリ' };
      useEntryClipboardStore.getState().copyEntry(newEntry);
      expect(useEntryClipboardStore.getState().copiedEntry?.title).toBe('新しいエントリ');
    });
  });

  describe('clearClipboard', () => {
    it('クリップボードをクリアできる', () => {
      useEntryClipboardStore.getState().copyEntry(mockEntry);
      useEntryClipboardStore.getState().clearClipboard();
      expect(useEntryClipboardStore.getState().copiedEntry).toBeNull();
      expect(useEntryClipboardStore.getState().hasCopiedEntry()).toBe(false);
    });
  });

  describe('lastClickedPosition', () => {
    it('位置を設定・取得できる', () => {
      const pos = { date: new Date('2026-03-30') };
      useEntryClipboardStore.getState().setLastClickedPosition(pos);
      expect(useEntryClipboardStore.getState().lastClickedPosition).toEqual(pos);
    });

    it('位置をクリアできる', () => {
      useEntryClipboardStore.getState().setLastClickedPosition({ date: new Date() });
      useEntryClipboardStore.getState().clearLastClickedPosition();
      expect(useEntryClipboardStore.getState().lastClickedPosition).toBeNull();
    });
  });
});
