'use client';

/**
 * Inspector フローティングポップオーバー（PC用）
 *
 * クリックされたブロックの横に表示。
 * DraggableInspector から位置計算のみを抽出した薄いラッパー。
 */

import { useCallback, useMemo, type ReactNode } from 'react';

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

export function FloatingPopover({ children, onClose, title, anchorRect }: FloatingPopoverProps) {
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
        style={style}
        className={cn(
          'bg-card text-card-foreground z-inspector',
          'surface-raised-heavy rounded-2xl',
          'flex max-h-[40rem] w-[95vw] max-w-[30rem] flex-col gap-0 overflow-hidden p-0',
        )}
        role="dialog"
        aria-modal="false"
        aria-label={title}
      >
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
