'use client';

/**
 * Inspector フローティングポップオーバー（PC用）
 *
 * ブロックの横に表示。左半分のブロック→右側、右半分→左側。
 * ブロックを隠さない。
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

import { cn, overlaySurface } from '@dayopt/components';
import type { AnchorRect } from '../../stores/useTimeblockInspectorStore';

const INSPECTOR_MAX_WIDTH = 480;
const INSPECTOR_MAX_HEIGHT = 640;
const GAP = 8;

interface FloatingPopoverProps {
  children: ReactNode;
  onClose: () => void;
  title: string;
  /** クリックされた要素の位置 */
  anchorRect?: AnchorRect | null | undefined;
}

/** ブロックの横に配置（左半分→右側、右半分→左側） */
function computePosition(anchor: AnchorRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // X: ブロック中心が左半分→右側、右半分→左側
  const blockCenter = anchor.left + anchor.width / 2;
  let x: number;
  if (blockCenter < vw / 2) {
    x = anchor.right + GAP;
  } else {
    x = anchor.left - INSPECTOR_MAX_WIDTH - GAP;
  }
  // 画面内にクランプ
  x = Math.max(GAP, Math.min(x, vw - INSPECTOR_MAX_WIDTH - GAP));

  // Y: ブロック上端に揃える。下にはみ出すなら上にずらす
  const y = Math.max(GAP, Math.min(anchor.top, vh - INSPECTOR_MAX_HEIGHT - GAP));

  return { x, y };
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** PC用Inspectorのフローティングポップオーバー（ブロックの横に左右出し分け） */
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
      previousFocusRef.current?.focus();
    };
  }, []);

  // フォーカストラップ
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

    // anchorRect がない場合は画面中央
    return {
      x: Math.max(GAP, (window.innerWidth - INSPECTOR_MAX_WIDTH) / 2),
      y: 100,
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

  return (
    <>
      <div
        className="z-inspector-backdrop fixed inset-0"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        style={{ left: position.x, top: position.y }}
        className={cn(
          overlaySurface({ radius: '2xl' }),
          'z-inspector',
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- popover サイズは viewport 連動の min()/dvh/vw が必要でトークン化不可
          'fixed flex max-h-[min(40rem,calc(100dvh-2rem))] w-[95vw] max-w-[30rem] flex-col gap-0 overflow-hidden p-0',
          'animate-in slide-in-from-bottom-2 duration-150 motion-reduce:animate-none',
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
