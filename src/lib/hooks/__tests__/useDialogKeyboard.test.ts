import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDialogKeyboard } from '../useDialogKeyboard';

describe('useDialogKeyboard', () => {
  describe('ESCキーでダイアログを閉じる', () => {
    it('ダイアログが開いている時にESCキーで閉じる', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(true, false, onClose));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('ダイアログが閉じている時はESCキーに反応しない', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(false, false, onClose));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onClose).not.toHaveBeenCalled();
    });

    it('ローディング中はESCキーに反応しない', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(true, true, onClose));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(onClose).not.toHaveBeenCalled();
    });

    it('ESC以外のキーには反応しない', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(true, false, onClose));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('オプション設定', () => {
    it('stopPropagation=trueで伝播を停止する', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(true, false, onClose, { stopPropagation: true }));

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const stopPropSpy = vi.spyOn(event, 'stopPropagation');
      document.dispatchEvent(event);

      expect(stopPropSpy).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('preventDefault=trueでデフォルト動作を防止する', () => {
      const onClose = vi.fn();
      renderHook(() => useDialogKeyboard(true, false, onClose, { preventDefault: true }));

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      document.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('クリーンアップ', () => {
    it('アンマウント時にイベントリスナーが解除される', () => {
      const onClose = vi.fn();
      const { unmount } = renderHook(() => useDialogKeyboard(true, false, onClose));

      unmount();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('ダイアログが閉じられた時にリスナーが解除される', () => {
      const onClose = vi.fn();
      const { rerender } = renderHook(({ isOpen }) => useDialogKeyboard(isOpen, false, onClose), {
        initialProps: { isOpen: true },
      });

      // ダイアログを閉じる
      rerender({ isOpen: false });

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
