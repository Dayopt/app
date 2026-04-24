'use client';

/**
 * Dayopt tags を使った Multiple Containers playground (cross-container 対応版)。
 *
 * - __root__: suffix === null のタグ
 * - group:<prefix>: 各 prefix 配下の子タグ
 *
 * 動作:
 * - 同一コンテナ内並び替え → reorderMutation (sort_order 更新)
 * - 異コンテナ間 drop → updateTag (name を rename して階層変更)
 *   - 子 → root: prefix を落とす (例: "仕事:開発" → "開発")
 *   - root → group: prefix を付ける (例: "読書" → "仕事:読書")
 *   - 子 → 別 group: prefix を差し替え (例: "仕事:開発" → "娯楽:開発")
 *
 * 注意: 実 DB に書き込むため、playground でドラッグすると sidebar の階層も変更される。
 */

import { useMemo, useRef, useState } from 'react';

import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
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

import type { Tag } from '@/features/tags';
import {
  TagIcon,
  buildColonTagName,
  parseColonTag,
  useReorderTags,
  useTags,
  useUpdateTag,
} from '@/features/tags';
import { resolveTagColor } from '@/lib/tag-colors';

type ContainerId = string; // "__root__" | `group:${prefix}`
type ContainersState = Record<ContainerId, string[]>;

const ROOT: ContainerId = '__root__';
const groupKey = (prefix: string): ContainerId => `group:${prefix}`;

interface DerivedContainers {
  containers: ContainersState;
  containerOrder: ContainerId[];
  tagById: Map<string, Tag>;
  containerForId: Map<string, ContainerId>;
}

function deriveContainers(tags: Tag[]): DerivedContainers {
  const sorted = tags
    .filter((t) => t.is_active !== false)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const rootItems: string[] = [];
  const containers: ContainersState = { [ROOT]: rootItems };
  const containerOrder: ContainerId[] = [ROOT];
  const tagById = new Map<string, Tag>();
  const containerForId = new Map<string, ContainerId>();

  for (const tag of sorted) {
    tagById.set(tag.id, tag);
    const { prefix, suffix } = parseColonTag(tag.name);
    if (suffix === null) {
      rootItems.push(tag.id);
      containerForId.set(tag.id, ROOT);
    } else {
      const key = groupKey(prefix);
      let bucket = containers[key];
      if (!bucket) {
        bucket = [];
        containers[key] = bucket;
        containerOrder.push(key);
      }
      bucket.push(tag.id);
      containerForId.set(tag.id, key);
    }
  }

  return { containers, containerOrder, tagById, containerForId };
}

function flattenToSortOrder(
  containers: ContainersState,
  containerOrder: ContainerId[],
): { id: string; sort_order: number }[] {
  const updates: { id: string; sort_order: number }[] = [];
  let i = 0;
  for (const cid of containerOrder) {
    for (const tagId of containers[cid] ?? []) {
      updates.push({ id: tagId, sort_order: i });
      i += 1;
    }
  }
  return updates;
}

/** container id からその container 用の prefix を取り出す。ROOT なら null */
function prefixFromContainer(cid: ContainerId): string | null {
  if (cid === ROOT) return null;
  return cid.replace(/^group:/, '');
}

/** tag を新 container へ移動したあとの新 name を計算 */
function computeRenamedName(tag: Tag, destContainer: ContainerId): string {
  const { suffix } = parseColonTag(tag.name);
  const leaf = suffix ?? tag.name;
  const destPrefix = prefixFromContainer(destContainer);
  return destPrefix ? buildColonTagName(destPrefix, leaf) : leaf;
}

export function DndTagsPlayground() {
  const { data } = useTags();
  const reorderMutation = useReorderTags();
  const updateTagMutation = useUpdateTag();

  const tags = useMemo(() => data ?? [], [data]);
  const derived = useMemo(() => deriveContainers(tags), [tags]);

  const [localContainers, setLocalContainers] = useState<ContainersState | null>(null);
  const containers = localContainers ?? derived.containers;

  const [activeId, setActiveId] = useState<string | null>(null);

  // 元の container を drag 開始時に記録（cross-container 判定用）
  const originContainerRef = useRef<ContainerId | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): ContainerId | null => {
    if (id in containers) return id;
    for (const cid of Object.keys(containers)) {
      if ((containers[cid] ?? []).includes(id)) return cid;
    }
    return null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
    originContainerRef.current = derived.containerForId.get(id) ?? null;
    if (!localContainers) setLocalContainers(derived.containers);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeContainer = findContainer(active.id as string);
    const overContainer = findContainer(over.id as string);
    if (!activeContainer || !overContainer) return;
    if (activeContainer === overContainer) return;

    setLocalContainers((prev) => {
      const base = prev ?? derived.containers;
      const activeItems = base[activeContainer] ?? [];
      const overItems = base[overContainer] ?? [];
      const activeIndex = activeItems.indexOf(active.id as string);
      const moving = activeItems[activeIndex];
      if (moving === undefined) return base;
      const overIndex = overItems.indexOf(over.id as string);
      const newIndex = overIndex >= 0 ? overIndex : overItems.length;
      return {
        ...base,
        [activeContainer]: activeItems.filter((id) => id !== active.id),
        [overContainer]: [...overItems.slice(0, newIndex), moving, ...overItems.slice(newIndex)],
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const origin = originContainerRef.current;
    originContainerRef.current = null;
    setActiveId(null);

    if (!over) {
      setLocalContainers(null);
      return;
    }

    const finalContainer = findContainer(active.id as string);
    if (!finalContainer) {
      setLocalContainers(null);
      return;
    }

    // ケース 1: cross-container → tag rename
    if (origin && origin !== finalContainer) {
      const tag = derived.tagById.get(active.id as string);
      if (!tag) {
        setLocalContainers(null);
        return;
      }
      const newName = computeRenamedName(tag, finalContainer);
      updateTagMutation
        .mutateAsync({ id: tag.id, name: newName })
        .finally(() => setLocalContainers(null));
      return;
    }

    // ケース 2: same-container → sort_order 更新
    const current = containers[finalContainer] ?? [];
    const overId = over.id as string;
    const oldIndex = current.indexOf(active.id as string);
    const newIndex = current.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      setLocalContainers(null);
      return;
    }
    const nextContainerItems = arrayMove(current, oldIndex, newIndex);
    const nextContainers: ContainersState = {
      ...containers,
      [finalContainer]: nextContainerItems,
    };
    setLocalContainers(nextContainers);
    const updates = flattenToSortOrder(nextContainers, derived.containerOrder);
    reorderMutation.mutate({ updates }, { onSettled: () => setLocalContainers(null) });
  };

  const handleDragCancel = () => {
    setActiveId(null);
    originContainerRef.current = null;
    setLocalContainers(null);
  };

  const activeTag = activeId ? derived.tagById.get(activeId) : undefined;

  // 表示用 container 順序。localContainers のキーと derived.containerOrder を合わせる。
  const renderContainerOrder = useMemo(() => {
    const ordered = [...derived.containerOrder];
    for (const cid of Object.keys(containers)) {
      if (!ordered.includes(cid)) ordered.push(cid);
    }
    return ordered;
  }, [derived.containerOrder, containers]);

  return (
    <div className="p-8">
      <h1 className="mb-2 text-lg font-medium">DnD Tags playground (cross-container 有効)</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        同一 container 内: sort_order 更新。異 container 間 drop: tag.name rename (階層変更)。 実 DB
        に書き込むので sidebar の階層も変わる。
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex flex-wrap gap-6">
          {renderContainerOrder.map((cid) => (
            <Container key={cid} id={cid} items={containers[cid] ?? []} tagById={derived.tagById} />
          ))}
        </div>
        <DragOverlay>{activeTag ? <TagCard tag={activeTag} isOverlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Container({
  id,
  items,
  tagById,
}: {
  id: ContainerId;
  items: string[];
  tagById: Map<string, Tag>;
}) {
  // container 自体を droppable にする（空のエリアへのドロップ対応）
  const { setNodeRef, isOver } = useDroppable({ id });
  const label = id === ROOT ? 'root' : id.replace(/^group:/, 'group: ');
  return (
    <div
      ref={setNodeRef}
      className={`bg-muted w-64 rounded-lg p-4 ${isOver ? 'ring-primary ring-2' : ''}`}
    >
      <div className="text-muted-foreground mb-2 text-xs font-medium">{label}</div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-8 flex-col gap-2">
          {items.map((tagId) => {
            const tag = tagById.get(tagId);
            if (!tag) return null;
            return <SortableTagRow key={tagId} tag={tag} />;
          })}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTagRow({ tag }: { tag: Tag }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TagCard tag={tag} />
    </div>
  );
}

function TagCard({ tag, isOverlay = false }: { tag: Tag; isOverlay?: boolean }) {
  const color = resolveTagColor(tag.color);
  const { suffix } = parseColonTag(tag.name);
  const label = suffix ?? tag.name;
  return (
    <div
      className={
        isOverlay
          ? 'bg-card shadow-card flex cursor-grabbing items-center gap-2 rounded-lg border p-2 text-sm'
          : 'bg-card flex cursor-grab items-center gap-2 rounded-lg border p-2 text-sm'
      }
    >
      <TagIcon icon={tag.icon} color={color} size="sm" />
      <span className="truncate">{label}</span>
    </div>
  );
}
