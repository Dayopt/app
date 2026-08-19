'use client';

/**
 * Inspector ドッキングパネル（PC用）
 *
 * DesktopLayout の3カラム目（lib/dom-slots 経由で登録される DOM ノード）へ
 * portal する非モーダルパネル。backdrop なし、Tab はカレンダー領域へ自由に抜けられる
 * （フォーカストラップは持たない）。開く前のフォーカス要素への復帰は維持する。
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DockedInspectorPanelProps {
  children: ReactNode;
  title: string;
  slotElement: HTMLElement | null;
}

/** DesktopLayout の3カラム目へ portal するドッキング型 Inspector パネル */
export function DockedInspectorPanel({ children, title, slotElement }: DockedInspectorPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // 開く前のフォーカス要素を記録し、パネルが開いたら最初のフォーカス可能な要素に移動。
  // 閉じたら記録していた要素へ復帰する。
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (focusable ?? panel).focus();
    }, 50);
    return () => {
      clearTimeout(timer);
      previousFocusRef.current?.focus();
    };
  }, []);

  if (!slotElement) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="region"
      aria-label={title}
      tabIndex={-1}
      className="flex h-full min-h-0 flex-col gap-0 overflow-hidden focus:outline-none"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>,
    slotElement,
  );
}
