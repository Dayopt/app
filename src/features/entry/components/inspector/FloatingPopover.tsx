'use client';

/**
 * Inspector フローティングポップオーバー（PC用）
 *
 * クリックされたブロックの横に表示。
 * DraggableInspector から位置計算のみを抽出した薄いラッパー。
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { AnchorRect } from '../../stores/useEntryInspectorStore';

const INSPECTOR_MAX_WIDTH = 480;
const INSPECTOR_MAX_HEIGHT = 640;
const GAP = 8;

interface FloatingPopoverProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
  /** クリックされた要素の位置（Inspector の配置に使用） */
  anchorRect?: AnchorRect | null | undefined;
}

/** anchorRect に基づいて Inspector の位置を計算 */
function computePosition(anchor: { top: number; right: number; bottom: number; left: number }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const spaceRight = vw - anchor.right - GAP;
  const spaceLeft = anchor.left - GAP;

  let x: number;
  if (spaceRight >= INSPECTOR_MAX_WIDTH) {
    x = anchor.right + GAP;
  } else if (spaceLeft >= INSPECTOR_MAX_WIDTH) {
    x = anchor.left - GAP - INSPECTOR_MAX_WIDTH;
  } else {
    x =
      spaceRight >= spaceLeft
        ? anchor.right + GAP
        : Math.max(0, anchor.left - GAP - INSPECTOR_MAX_WIDTH);
  }

  const y = Math.max(GAP, Math.min(anchor.top, vh - INSPECTOR_MAX_HEIGHT - GAP));

  return { x, y };
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** PC用Inspectorのフローティングポップオーバー（anchorRectに基づいて位置を自動計算） */
export function FloatingPopover({ children, onClose, title, anchorRect }: FloatingPopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // 開く前のフォーカス要素を記録し、パネルが開いたら最初のフォーカス可能な要素に移動
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable) {
        focusable.focus();
      } else {
        panel.focus();
      }
    }, 50);
    return () => {
      clearTimeout(timer);
      // 閉じる時に元の要素にフォーカスを返す
      previousFocusRef.current?.focus();
    };
  }, []);

  // フォーカストラップ: Tab/Shift+Tab でパネル内にフォーカスを閉じ込める
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusableElements = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusableElements.length === 0) return;

      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', handleKeyDown);
    return () => panel.removeEventListener('keydown', handleKeyDown);
  }, []);

  const position = useMemo(() => {
    if (typeof window === 'undefined') return { x: 100, y: 100 };

    if (anchorRect) {
      return computePosition(anchorRect);
    }

    return {
      x: Math.max(0, (window.innerWidth - INSPECTOR_MAX_WIDTH) / 2),
      y: Math.max(0, Math.min(100, (window.innerHeight - INSPECTOR_MAX_HEIGHT) / 4)),
    };
  }, [anchorRect]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const style: React.CSSProperties = {
    position: 'fixed',
    left: position.x,
    top: position.y,
  };

  return (
    <>
      <div
        className="z-inspector-backdrop fixed inset-0"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        style={style}
        className={cn(
          'bg-card text-card-foreground z-inspector',
          'rounded-2xl shadow-lg',
          'flex max-h-[min(40rem,calc(100dvh-2rem))] w-[95vw] max-w-[30rem] flex-col gap-0 overflow-hidden p-0',
          'animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none',
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
