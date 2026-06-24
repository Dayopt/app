'use client';

import { type ReactNode, useMemo, useState } from 'react';

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import type { Tag, TagTreeNode } from '@/features/tags';
import {
  TagIcon,
  buildTagHierarchyUpdates,
  flattenTagTree,
  resolveTagColor,
  useReorderTags,
  useTagsHierarchy,
} from '@/features/tags';
import { cn } from '@dayopt/components';

const ROOT = '__root__';

function childContainerId(parentId: string) {
  return `children:${parentId}`;
}

type TreeTag =
  | {
      kind: 'root';
      tag: Tag;
      children: Tag[];
    }
  | {
      kind: 'child';
      tag: Tag;
      parentId: string;
    };

function cloneNodes(nodes: TagTreeNode[]): TagTreeNode[] {
  return nodes.map((node) => ({
    tag: { ...node.tag },
    children: node.children.map((child) => ({ ...child })),
  }));
}

function findRootIndex(nodes: TagTreeNode[], tagId: string): number {
  return nodes.findIndex((node) => node.tag.id === tagId);
}

function findChildLocation(
  nodes: TagTreeNode[],
  tagId: string,
): { rootIndex: number; childIndex: number } | null {
  for (let rootIndex = 0; rootIndex < nodes.length; rootIndex += 1) {
    const childIndex = nodes[rootIndex]?.children.findIndex((child) => child.id === tagId) ?? -1;
    if (childIndex >= 0) return { rootIndex, childIndex };
  }
  return null;
}

function findTreeTag(nodes: TagTreeNode[], tagId: string): TreeTag | null {
  const rootIndex = findRootIndex(nodes, tagId);
  if (rootIndex >= 0) {
    const root = nodes[rootIndex]!;
    return { kind: 'root', tag: root.tag, children: root.children };
  }

  const childLocation = findChildLocation(nodes, tagId);
  if (!childLocation) return null;

  const parent = nodes[childLocation.rootIndex]!;
  const child = parent.children[childLocation.childIndex]!;
  return { kind: 'child', tag: child, parentId: parent.tag.id };
}

function findContainer(nodes: TagTreeNode[], id: string): string | null {
  if (id === ROOT) return ROOT;
  if (id.startsWith('children:')) return id;
  if (findRootIndex(nodes, id) >= 0) return ROOT;

  const childLocation = findChildLocation(nodes, id);
  return childLocation ? childContainerId(nodes[childLocation.rootIndex]!.tag.id) : null;
}

function canBecomeChild(treeTag: TreeTag): boolean {
  return treeTag.kind === 'child' || treeTag.children.length === 0;
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function moveTagTree(nodes: TagTreeNode[], activeId: string, overId: string): TagTreeNode[] | null {
  const active = findTreeTag(nodes, activeId);
  if (!active) return null;

  const destinationContainer = findContainer(nodes, overId);
  if (!destinationContainer) return null;

  const nextNodes = cloneNodes(nodes);
  const rootIndex = findRootIndex(nextNodes, activeId);
  const childLocation = findChildLocation(nextNodes, activeId);

  let movingRoot: TagTreeNode | null = null;
  let movingChild: Tag | null = null;

  if (rootIndex >= 0) {
    movingRoot = nextNodes[rootIndex]!;
    nextNodes.splice(rootIndex, 1);
  } else if (childLocation) {
    movingChild = nextNodes[childLocation.rootIndex]!.children[childLocation.childIndex]!;
    nextNodes[childLocation.rootIndex]!.children.splice(childLocation.childIndex, 1);
  } else {
    return null;
  }

  if (destinationContainer === ROOT) {
    const rawIndex =
      overId === ROOT
        ? nextNodes.length
        : findRootIndex(nextNodes, overId) >= 0
          ? findRootIndex(nextNodes, overId)
          : nextNodes.length;

    if (movingRoot) {
      nextNodes.splice(Math.max(0, Math.min(rawIndex, nextNodes.length)), 0, movingRoot);
      return nextNodes;
    }

    if (!movingChild) return null;
    nextNodes.splice(Math.max(0, Math.min(rawIndex, nextNodes.length)), 0, {
      tag: { ...movingChild, parent_id: null },
      children: [],
    });
    return nextNodes;
  }

  const targetParentId = destinationContainer.replace(/^children:/, '');
  if (activeId === targetParentId) return null;

  const targetRootIndex = findRootIndex(nextNodes, targetParentId);
  if (targetRootIndex < 0) return null;

  if (movingRoot && movingRoot.children.length > 0) {
    return null;
  }

  const targetNode = nextNodes[targetRootIndex]!;
  const baseChildren = targetNode.children.slice();
  const rawIndex =
    overId === destinationContainer
      ? baseChildren.length
      : baseChildren.findIndex((child) => child.id === overId);
  const insertIndex = rawIndex >= 0 ? rawIndex : baseChildren.length;

  if (movingRoot) {
    targetNode.children = insertAt(baseChildren, insertIndex, {
      ...movingRoot.tag,
      parent_id: targetParentId,
    });
    return nextNodes;
  }

  if (!movingChild) return null;
  targetNode.children = insertAt(baseChildren, insertIndex, {
    ...movingChild,
    parent_id: targetParentId,
  });
  return nextNodes;
}

export function DndTagsPlayground() {
  const { data } = useTagsHierarchy();
  const reorderMutation = useReorderTags();

  const [localNodes, setLocalNodes] = useState<TagTreeNode[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const nodes = useMemo(() => localNodes ?? data ?? [], [localNodes, data]);
  const flatTags = useMemo(() => flattenTagTree(nodes), [nodes]);
  const rootIds = useMemo(() => nodes.map((node) => node.tag.id), [nodes]);
  const activeTreeTag = useMemo(
    () => (activeId ? findTreeTag(nodes, activeId) : null),
    [activeId, nodes],
  );
  const activeTag = useMemo(
    () => (activeId ? (flatTags.find((tag) => tag.id === activeId) ?? null) : null),
    [activeId, flatTags],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const nextTree = moveTagTree(nodes, active.id as string, over.id as string);
    if (!nextTree) return;

    setLocalNodes(nextTree);
    reorderMutation.mutate(
      { updates: buildTagHierarchyUpdates(nextTree) },
      {
        onSettled: () => setLocalNodes(null),
      },
    );
  };

  return (
    <div className="p-8">
      <h1 className="mb-2 text-lg font-medium">DnD Tags playground</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Root reorder, child reorder, child move, promote to root, and leaf-to-parent nesting.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          <DroppableColumn id={ROOT} title="root">
            {nodes.map((node) => (
              <PlaygroundRoot
                key={node.tag.id}
                node={node}
                activeId={activeId}
                activeTreeTag={activeTreeTag}
              />
            ))}
          </DroppableColumn>
        </SortableContext>

        <DragOverlay>{activeTag ? <TagCard tag={activeTag} isOverlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function PlaygroundRoot({
  node,
  activeId,
  activeTreeTag,
}: {
  node: TagTreeNode;
  activeId: string | null;
  activeTreeTag: TreeTag | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.tag.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const canAcceptChildren =
    !!activeTreeTag && activeTreeTag.tag.id !== node.tag.id && canBecomeChild(activeTreeTag);

  return (
    <div ref={setNodeRef} style={style} className="space-y-2">
      <div {...attributes} {...listeners}>
        <TagCard tag={node.tag} />
      </div>

      <SortableContext
        items={node.children.map((child) => child.id)}
        strategy={verticalListSortingStrategy}
      >
        <DroppableColumn
          id={childContainerId(node.tag.id)}
          {...(node.children.length > 0 ? { title: `children of ${node.tag.name}` } : {})}
          className={cn('ml-8', node.children.length === 0 && !activeId && 'hidden')}
        >
          {node.children.map((child) => (
            <SortableChild key={child.id} tag={child} />
          ))}
          {activeId && canAcceptChildren && node.children.length === 0 ? (
            <div className="text-muted-foreground px-3 py-1 text-xs">nest here</div>
          ) : null}
        </DroppableColumn>
      </SortableContext>
    </div>
  );
}

function SortableChild({ tag }: { tag: Tag }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="ml-4">
      <TagCard tag={tag} />
    </div>
  );
}

function DroppableColumn({
  id,
  title,
  className,
  children,
}: {
  id: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={cn('bg-muted min-h-8 rounded-lg p-4', isOver && 'ring-primary ring-2', className)}
    >
      {title ? <div className="text-muted-foreground mb-2 text-xs font-medium">{title}</div> : null}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function TagCard({ tag, isOverlay = false }: { tag: Tag; isOverlay?: boolean }) {
  const color = resolveTagColor(tag.color);

  return (
    <div
      className={cn(
        'bg-card flex items-center gap-2 rounded-lg border p-2 text-sm',
        isOverlay ? 'shadow-card cursor-grabbing' : 'cursor-grab',
      )}
    >
      <TagIcon icon={tag.icon} color={color} size="sm" />
      <span className="truncate">{tag.name}</span>
    </div>
  );
}
