'use client';

import { type RefObject, useEffect, useRef } from 'react';

/**
 * カスタムモーダル用フォーカストラップフック
 *
 * Radix UI を使わない createPortal ベースのモーダルに対して、
 * フォーカストラップ・初期フォーカス・フォーカス復元を提供する。
 *
 * @param containerRef - フォーカスを閉じ込めるコンテナの ref
 * @param isOpen - モーダルが開いているかどうか
 * @param options.autoFocus - 初期フォーカスを自動で行うか（default: true）
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
  options: { autoFocus?: boolean } = {},
): void {
  const { autoFocus = true } = options;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // フォーカス復元: モーダルが開く前のフォーカス要素を記録
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
    }

    return () => {
      // モーダルが閉じたらフォーカスを復元
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  // 初期フォーカス: コンテナ内の最初のフォーカス可能要素にフォーカス
  useEffect(() => {
    if (!isOpen || !autoFocus) return;

    // レンダリング完了後に実行
    const timer = setTimeout(() => {
      const container = containerRef.current;
      if (!container) return;

      // autoFocus 属性を持つ要素を優先
      const autoFocusEl = container.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
      if (autoFocusEl) {
        autoFocusEl.focus();
        return;
      }

      // 最初のフォーカス可能要素にフォーカス
      const focusable = getFocusableElements(container);
      const firstEl = focusable[0];
      if (firstEl) {
        firstEl.focus();
      } else {
        // フォーカス可能要素がない場合はコンテナ自体にフォーカス
        container.focus();
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [isOpen, autoFocus, containerRef]);

  // Tab キートラップ
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        // Shift+Tab: 最初の要素にいたら最後に
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: 最後の要素にいたら最初に
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, containerRef]);
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.closest('[aria-hidden="true"]') && el.offsetParent !== null,
  );
}
