import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useSubmitShortcut } from '../useSubmitShortcut';

function dispatchKeydown(key: string, modifiers: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, ...modifiers });
  document.dispatchEvent(event);
  return event;
}

describe('useSubmitShortcut', () => {
  describe('Cmd+Enter / Ctrl+Enter', () => {
    it('Cmd+Enterで送信される（Mac）', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: true, isLoading: false, onSubmit }));

      dispatchKeydown('Enter', { metaKey: true });

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+Enterで送信される（Windows/Linux）', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: true, isLoading: false, onSubmit }));

      dispatchKeydown('Enter', { ctrlKey: true });

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('修飾キーなしのEnterでは送信されない', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: true, isLoading: false, onSubmit }));

      dispatchKeydown('Enter');

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('他のキー+Cmdでは送信されない', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: true, isLoading: false, onSubmit }));

      dispatchKeydown('a', { metaKey: true });
      dispatchKeydown('s', { ctrlKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('無効化条件', () => {
    it('enabled=falseの時は反応しない', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: false, isLoading: false, onSubmit }));

      dispatchKeydown('Enter', { metaKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('isLoading=trueの時は反応しない', () => {
      const onSubmit = vi.fn();
      renderHook(() => useSubmitShortcut({ enabled: true, isLoading: true, onSubmit }));

      dispatchKeydown('Enter', { metaKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('checkDisabledがtrueを返す時は反応しない', () => {
      const onSubmit = vi.fn();
      renderHook(() =>
        useSubmitShortcut({
          enabled: true,
          isLoading: false,
          onSubmit,
          checkDisabled: () => true,
        }),
      );

      dispatchKeydown('Enter', { metaKey: true });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('checkDisabledがfalseを返す時は送信される', () => {
      const onSubmit = vi.fn();
      renderHook(() =>
        useSubmitShortcut({
          enabled: true,
          isLoading: false,
          onSubmit,
          checkDisabled: () => false,
        }),
      );

      dispatchKeydown('Enter', { metaKey: true });

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
  });

  describe('クリーンアップ', () => {
    it('アンマウント時にリスナーが解除される', () => {
      const onSubmit = vi.fn();
      const { unmount } = renderHook(() =>
        useSubmitShortcut({ enabled: true, isLoading: false, onSubmit }),
      );

      unmount();

      dispatchKeydown('Enter', { metaKey: true });
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });
});
