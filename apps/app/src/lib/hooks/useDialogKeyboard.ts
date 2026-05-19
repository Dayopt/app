'use client';

import { useEffect } from 'react';

interface UseDialogKeyboardOptions {
  /** captureフェーズで処理するかどうか（他のハンドラより先に処理） */
  capture?: boolean;
  /** イベントの伝播を停止するかどうか */
  stopPropagation?: boolean;
  /** デフォルトの動作を防止するかどうか */
  preventDefault?: boolean;
}

/**
 * ダイアログのキーボードイベントを処理するフック
 *
 * - ESCキーでダイアログを閉じる
 * - ローディング中は無効化
 *
 * @param isOpen - ダイアログが開いているかどうか
 * @param isLoading - ローディング中かどうか（true の場合、ESCキーは無視される）
 * @param onClose - ダイアログを閉じるコールバック
 * @param options - オプション設定
 *
 * @example
 * ```tsx
 * // 基本的な使用法
 * function MyDialog({ isOpen, onClose }) {
 *   const [isLoading, setIsLoading] = useState(false);
 *   useDialogKeyboard(isOpen, isLoading, onClose);
 *   // ...
 * }
 *
 * // captureフェーズで処理（他のハンドラより先に処理）
 * useDialogKeyboard(isOpen, isLoading, onClose, {
 *   capture: true,
 *   stopPropagation: true,
 *   preventDefault: true,
 * });
 * ```
 */
export function useDialogKeyboard(
  isOpen: boolean,
  isLoading: boolean,
  onClose: () => void,
  options: UseDialogKeyboardOptions = {},
): void {
  const { capture = false, stopPropagation = false, preventDefault = false } = options;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        if (stopPropagation) e.stopPropagation();
        if (preventDefault) e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown, capture);
    return () => document.removeEventListener('keydown', handleKeyDown, capture);
  }, [isOpen, isLoading, onClose, capture, stopPropagation, preventDefault]);
}
