'use client';

import { useEffect } from 'react';

interface UseSubmitShortcutOptions {
  /** フックが有効かどうか（isOpen, isDraftMode等） */
  enabled: boolean;
  /** 保存中かどうか（重複送信防止） */
  isLoading: boolean;
  /** 送信ハンドラー */
  onSubmit: () => void;
  /** 動的な無効チェック（ref経由等、呼び出し時に評価） */
  checkDisabled?: () => boolean;
}

/**
 * Cmd+Enter (Mac) / Ctrl+Enter (Win/Linux) で送信するショートカット
 *
 * `useDialogKeyboard`（Escape処理）と対になるフック。
 * document レベルで listen するため、どの入力欄にフォーカスがあっても動作する。
 *
 * @example
 * ```tsx
 * useSubmitShortcut({
 *   enabled: isOpen,
 *   isLoading,
 *   onSubmit: handleSubmit,
 * });
 *
 * // 動的な無効チェック（ref経由）
 * useSubmitShortcut({
 *   enabled: isDraftMode,
 *   isLoading: isSaving,
 *   checkDisabled: () => formRef.current?.isSaveDisabled() ?? false,
 *   onSubmit: () => formRef.current?.save(),
 * });
 * ```
 */
export function useSubmitShortcut({
  enabled,
  isLoading,
  onSubmit,
  checkDisabled,
}: UseSubmitShortcutOptions): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Enter (Mac) または Ctrl+Enter (Win/Linux)
      if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;

      // 保存中・バリデーション失敗は無視
      if (isLoading) return;
      if (checkDisabled?.()) return;

      e.preventDefault();
      onSubmit();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isLoading, onSubmit, checkDisabled]);
}
