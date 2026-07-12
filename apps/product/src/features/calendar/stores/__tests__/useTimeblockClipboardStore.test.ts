import { beforeEach, describe, expect, it } from 'vitest';

import type { ClipboardTimeblock } from '../useTimeblockClipboardStore';
import { useTimeblockClipboardStore } from '../useTimeblockClipboardStore';

const mockEntry: ClipboardTimeblock = {
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
      expect(state.copiedTimeblock).toBeNull();
      expect(state.lastClickedPosition).toBeNull();
    });

    it('hasCopiedTimeblockがfalse', () => {
      expect(useTimeblockClipboardStore.getState().hasCopiedTimeblock()).toBe(false);
    });
  });

  describe('copyTimeblock', () => {
    it('エントリをコピーできる', () => {
      useTimeblockClipboardStore.getState().copyTimeblock(mockEntry);
      expect(useTimeblockClipboardStore.getState().copiedTimeblock).toEqual(mockEntry);
    });

    it('hasCopiedTimeblockがtrueになる', () => {
      useTimeblockClipboardStore.getState().copyTimeblock(mockEntry);
      expect(useTimeblockClipboardStore.getState().hasCopiedTimeblock()).toBe(true);
    });

    it('上書きコピーできる', () => {
      useTimeblockClipboardStore.getState().copyTimeblock(mockEntry);
      const newEntry = { ...mockEntry, title: '新しいエントリ' };
      useTimeblockClipboardStore.getState().copyTimeblock(newEntry);
      expect(useTimeblockClipboardStore.getState().copiedTimeblock?.title).toBe('新しいエントリ');
    });
  });

  describe('clearClipboard', () => {
    it('クリップボードをクリアできる', () => {
      useTimeblockClipboardStore.getState().copyTimeblock(mockEntry);
      useTimeblockClipboardStore.getState().clearClipboard();
      expect(useTimeblockClipboardStore.getState().copiedTimeblock).toBeNull();
      expect(useTimeblockClipboardStore.getState().hasCopiedTimeblock()).toBe(false);
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
