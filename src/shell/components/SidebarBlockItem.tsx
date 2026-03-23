'use client';

/**
 * SidebarBlockItem — サイドバー用ブロックアイテム（共通コンポーネント）
 *
 * タグカラードット + タグ名 + duration + ホバー時メニュー
 * クリックで現在時刻にエントリを配置 / ドラッグでカレンダーに配置
 * Palette・RecentBlocks の両方で使用。
 */

import { useDraggable } from '@dnd-kit/core';
import { MoreHorizontal } from 'lucide-react';
import { useMemo } from 'react';

import { HoverTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** サイドバーブロックアイテムのドラッグデータ（DnDProvider で識別に使用） */
export interface SidebarBlockDragData {
  type: 'palette-item';
  tagId: string;
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
}

interface SidebarBlockItemProps {
  tagName: string;
  tagColor: string | null;
  durationMinutes: number;
  onClick: () => void;
  className?: string;
  /** ドラッグ用タグID（省略時はドラッグ無効） */
  tagId?: string;
  /** ホバーツールチップの内容 */
  tooltipContent: string;
  /** メニュートリガーのスロット（DropdownMenu等を渡す） */
  menuSlot?: React.ReactNode;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h${remainder}m` : `${hours}h`;
}

/** サイドバーブロックアイテム（タグカラードット + タグ名 + duration + ホバーメニュー） */
export function SidebarBlockItem({
  tagName,
  tagColor,
  durationMinutes,
  onClick,
  className,
  tagId,
  tooltipContent,
  menuSlot,
}: SidebarBlockItemProps) {
  const dragData = useMemo<SidebarBlockDragData>(
    () => ({ type: 'palette-item', tagId: tagId ?? '', tagName, tagColor, durationMinutes }),
    [tagId, tagName, tagColor, durationMinutes],
  );

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: tagId ? `palette-${tagId}-${durationMinutes}` : 'palette-disabled',
    data: dragData,
    disabled: !tagId,
  });

  return (
    <HoverTooltip
      content={tooltipContent}
      side="right"
      wrapperClassName="w-full"
      wrapperDisplay="flex"
    >
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

        {/* ホバー時メニューアイコン */}
        {menuSlot ? (
          menuSlot
        ) : (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground hover:bg-state-hover flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/block:opacity-100 [@media(hover:none)]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </div>
    </HoverTooltip>
  );
}
