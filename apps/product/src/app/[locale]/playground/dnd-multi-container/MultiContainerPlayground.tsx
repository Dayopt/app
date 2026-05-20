'use client';

/**
 * dnd-kit Multiple Containers playground.
 *
 * 公式サンプルを簡略化した参照実装:
 * - https://docs.dndkit.com/presets/sortable/multiple-containers
 * - https://codesandbox.io/s/multiple-containers-5cb871
 *
 * 2 つの垂直リスト間でアイテム移動・同リスト内並び替え・DragOverlay を動作確認する。
 * Dayopt の TagFlatList 書き換え時の参照実装として残す。
 */

import { useState } from 'react';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type ContainerId = 'A' | 'B';
type ItemsState = Record<ContainerId, string[]>;

const INITIAL: ItemsState = {
  A: ['a1', 'a2', 'a3', 'a4'],
  B: ['b1', 'b2', 'b3'],
};

const CONTAINER_ORDER: ContainerId[] = ['A', 'B'];

export function MultiContainerPlayground() {
  const [items, setItems] = useState<ItemsState>(INITIAL);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): ContainerId | null => {
    if (id in items) return id as ContainerId;
    for (const containerId of CONTAINER_ORDER) {
      if (items[containerId].includes(id)) return containerId;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);

    if (!activeContainer || !overContainer || activeContainer === overContainer) return;

    setItems((prev) => {
      const activeItems = prev[activeContainer];
      const overItems = prev[overContainer];
      const activeIndex = activeItems.indexOf(active.id as string);
      const overIndex = overItems.indexOf(over.id as string);

      const newIndex = overIndex >= 0 ? overIndex : overItems.length;

      return {
        ...prev,
        [activeContainer]: activeItems.filter((id) => id !== active.id),
        [overContainer]: [
          ...overItems.slice(0, newIndex),
          activeItems[activeIndex],
          ...overItems.slice(newIndex),
        ],
      } as ItemsState;
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer) return;
    if (activeContainer !== overContainer) return;

    const containerItems = items[activeContainer];
    const oldIndex = containerItems.indexOf(active.id as string);
    const newIndex = containerItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    setItems((prev) => ({
      ...prev,
      [activeContainer]: arrayMove(prev[activeContainer], oldIndex, newIndex),
    }));
  };

  return (
    <div className="p-8">
      <h1 className="mb-2 text-lg font-medium">dnd-kit Multiple Containers playground</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        公式サンプル準拠。A / B 間でアイテムが移動でき、同コンテナ内で並び替えできれば成功。
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-6">
          {CONTAINER_ORDER.map((containerId) => (
            <Container key={containerId} id={containerId} items={items[containerId]} />
          ))}
        </div>
        <DragOverlay>{activeId ? <ItemCard id={activeId} isOverlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Container({ id, items }: { id: ContainerId; items: string[] }) {
  return (
    <div className="bg-muted w-64 rounded-lg p-4">
      <div className="text-muted-foreground mb-2 text-xs font-medium">Container {id}</div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2">
          {items.map((itemId) => (
            <SortableItem key={itemId} id={itemId} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableItem({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ItemCard id={id} />
    </div>
  );
}

function ItemCard({ id, isOverlay = false }: { id: string; isOverlay?: boolean }) {
  return (
    <div
      className={
        isOverlay
          ? 'bg-card shadow-card cursor-grabbing rounded-lg border p-3 text-sm'
          : 'bg-card cursor-grab rounded-lg border p-3 text-sm'
      }
    >
      {id}
    </div>
  );
}
