import { beforeEach, describe, expect, it } from 'vitest';

import type { ClipboardEntry } from '../useTimeblockClipboardStore';
import { useTimeblockClipboardStore } from '../useTimeblockClipboardStore';

const mockEntry: ClipboardEntry = {
  title: 'テストエントリ',
  description: '説明文',
  duration: 60,
  startHour: 10,
  startMinute: 0,
  tagId: 'tag-1',
};

describe('useTimeblockClipboardStore', () => {
  beforeEach(() => {
    useTimeblockClipboardStore.getState().clearClipboard();
    useTimeblockClipboardStore.getState().clearLastClickedPosition();
  });

  describe('初期状態', () => {
    it('クリップボードが空', () => {
      const state = useTimeblockClipboardStore.getState();
      expect(state.copiedEntry).toBeNull();
      expect(state.lastClickedPosition).toBeNull();
    });

    it('hasCopiedEntryがfalse', () => {
      expect(useTimeblockClipboardStore.getState().hasCopiedEntry()).toBe(false);
    });
  });

  describe('copyEntry', () => {
    it('エントリをコピーできる', () => {
      useTimeblockClipboardStore.getState().copyEntry(mockEntry);
      expect(useTimeblockClipboardStore.getState().copiedEntry).toEqual(mockEntry);
    });

    it('hasCopiedEntryがtrueになる', () => {
      useTimeblockClipboardStore.getState().copyEntry(mockEntry);
      expect(useTimeblockClipboardStore.getState().hasCopiedEntry()).toBe(true);
    });

    it('上書きコピーできる', () => {
      useTimeblockClipboardStore.getState().copyEntry(mockEntry);
      const newEntry = { ...mockEntry, title: '新しいエントリ' };
      useTimeblockClipboardStore.getState().copyEntry(newEntry);
      expect(useTimeblockClipboardStore.getState().copiedEntry?.title).toBe('新しいエントリ');
    });
  });

  describe('clearClipboard', () => {
    it('クリップボードをクリアできる', () => {
      useTimeblockClipboardStore.getState().copyEntry(mockEntry);
      useTimeblockClipboardStore.getState().clearClipboard();
      expect(useTimeblockClipboardStore.getState().copiedEntry).toBeNull();
      expect(useTimeblockClipboardStore.getState().hasCopiedEntry()).toBe(false);
    });
  });

  describe('lastClickedPosition', () => {
    it('位置を設定・取得できる', () => {
      const pos = { date: new Date('2026-03-30') };
      useTimeblockClipboardStore.getState().setLastClickedPosition(pos);
      expect(useTimeblockClipboardStore.getState().lastClickedPosition).toEqual(pos);
    });

    it('位置をクリアできる', () => {
      useTimeblockClipboardStore.getState().setLastClickedPosition({ date: new Date() });
      useTimeblockClipboardStore.getState().clearLastClickedPosition();
      expect(useTimeblockClipboardStore.getState().lastClickedPosition).toBeNull();
    });
  });
});
