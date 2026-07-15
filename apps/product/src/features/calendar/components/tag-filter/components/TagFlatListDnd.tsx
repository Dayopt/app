'use client';

import type { ReactNode } from 'react';

import type { CollisionDetection, Modifier } from '@dnd-kit/core';
import { closestCorners, pointerWithin, useDroppable } from '@dnd-kit/core';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { getEventCoordinates } from '@dnd-kit/utilities';

import { cn } from '@dayopt/components';

import { END_OF_ROOT, ROOT, childContainerId } from './move-tag-tree';

// drag 中に他 item を動かさず、drop indicator 線だけで挿入位置を示す
export const noopSortingStrategy: SortingStrategy = () => null;

// chip の中心をカーソルに吸い付ける（行頭固定だと chip が左に寄る）
export const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + coords.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + coords.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

export const preferSmallestCollision: CollisionDetection = (args) => {
  // active 自身の children container は drop 先にできない（self-parent 防止）。
  // expanded parent をドラッグした際、自身の子コンテナが cursor を遮って
  // ROOT 末尾に落とせない問題を防ぐため collision 段階で除外する。
  const activeId = args.active?.id;
  const ownChildContainerId = typeof activeId === 'string' ? childContainerId(activeId) : null;
  const exclude = (id: unknown) => ownChildContainerId !== null && id === ownChildContainerId;

  const pointerCollisions = pointerWithin(args).filter((c) => !exclude(c.id));
  if (pointerCollisions.length > 0) {
    return [...pointerCollisions].sort((a, b) => {
      const aRect = args.droppableRects.get(a.id);
      const bRect = args.droppableRects.get(b.id);
      if (!aRect || !bRect) return 0;
      return aRect.width * aRect.height - bRect.width * bRect.height;
    });
  }

  return closestCorners(args).filter((c) => !exclude(c.id));
};

export function DroppableArea({
  id,
  role,
  className,
  children,
}: {
  id: string;
  role?: string;
  className?: string;
  children?: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // ROOT は list 全体の bbox。cursor が item 間の gap に入るたび isOver になり line が画面下端に飛ぶため抑制
  const showContainerLine = isOver && id !== ROOT;

  return (
    <div ref={setNodeRef} role={role} className={cn('relative', className)}>
      {children}
      {showContainerLine ? (
        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 z-10"
          style={{ height: 'var(--border-indicator)' }}
        />
      ) : null}
    </div>
  );
}

// 末尾 drop zone。ROOT bbox が items 合計と一致するため、これがないと「最後のアイテムより下」
// に cursor を置けず、root tag を末尾に並べ替えられない
export function EndOfRootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: END_OF_ROOT });
  return (
    <div ref={setNodeRef} className="relative h-3" aria-hidden>
      {isOver ? (
        <div
          className="bg-primary pointer-events-none absolute inset-x-0 top-1 z-10"
          style={{ height: 'var(--border-indicator)' }}
        />
      ) : null}
    </div>
  );
}
