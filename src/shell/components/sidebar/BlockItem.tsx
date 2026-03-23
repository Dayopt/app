'use client';

/**
 * BlockItem — ブロックアイテム（共通コンポーネント）
 *
 * タグカラードット + タグ名 + duration + ホバー時メニュー
 * クリックで現在時刻にエントリを配置 / ドラッグでカレンダーに配置
 * Palette・RecentBlocks の両方で使用。
 */

import { useDraggable } from '@dnd-kit/core';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

/** ブロックアイテムのドラッグデータ（DnDProvider で識別に使用） */
export interface BlockDragData {
  type: 'palette-item';
  tagId: string;
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
}

interface BlockItemProps {
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
  onClick: () => void;
  className?: string;
  /** ドラッグ用タグID（省略時はドラッグ無効） */
  tagId?: string;
  /** メニュートリガーのスロット（DropdownMenu等を渡す） */
  menuSlot?: React.ReactNode;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}m` : `${hours}h`;
}

/** ブロックアイテム（タグカラードット + タグ名 + duration + ホバーメニュー） */
export function BlockItem({
  tagName,
  tagColor,
  durationMinutes,
  onClick,
  className,
  tagId,
  menuSlot,
}: BlockItemProps) {
  const dragData = useMemo<BlockDragData>(
    () => ({ type: 'palette-item', tagId: tagId ?? '', tagName, tagColor, durationMinutes }),
    [tagId, tagName, tagColor, durationMinutes],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tagId ? `palette-${tagId}-${durationMinutes}` : 'palette-disabled',
    data: dragData,
    disabled: !tagId,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'group/block hover:bg-state-hover flex h-8 w-full items-center rounded text-sm transition-colors',
        isDragging && 'opacity-50',
        className,
      )}
      {...attributes}
      {...listeners}
    >
      {/* クリック領域（タグ名 + duration） */}
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-2"
      >
        {/* タグカラードット */}
        <span
          className={cn(
            'size-2.5 shrink-0 rounded-full',
            tagColor ? `bg-tag-${tagColor}` : 'bg-muted',
          )}
          aria-hidden="true"
        />

        {/* タグ名 */}
        <span className="text-foreground min-w-0 truncate">{tagName}</span>

        {/* duration（タグ名の隣） */}
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatDuration(durationMinutes)}
        </span>
      </button>

      {/* ホバー時メニュースロット */}
      {menuSlot}
    </div>
  );
}
