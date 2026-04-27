'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import type { CollisionDetection, DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale, useTranslations } from 'next-intl';

import type { Tag, TagTreeNode } from '@/features/tags';
import {
  CreateTagPopover,
  TagIcon,
  buildTagHierarchyUpdates,
  useCreateTag,
  useMergeTag,
  useReorderTags,
  useUpdateTag,
} from '@/features/tags';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { DropdownMenu, DropdownMenuTrigger } from '@/lib/components/ui/dropdown-menu';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { resolveTagColor } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';

import { FilterItemMenu, type GroupOption } from './FilterItem/FilterItemMenu';
import { useFilterItemEdit } from './FilterItem/useFilterItemEdit';
import { GroupHeader } from './GroupHeader';
import { TagEntryCreatePopover } from './TagEntryCreatePopover';

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
    if (childIndex >= 0) {
      return { rootIndex, childIndex };
    }
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
  return {
    kind: 'child',
    tag: child,
    parentId: parent.tag.id,
  };
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

const preferSmallestCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return [...pointerCollisions].sort((a, b) => {
      const aRect = args.droppableRects.get(a.id);
      const bRect = args.droppableRects.get(b.id);
      if (!aRect || !bRect) return 0;
      return aRect.width * aRect.height - bRect.width * bRect.height;
    });
  }

  return closestCorners(args);
};

interface TagFlatListProps {
  nodes: TagTreeNode[];
  allTags: Tag[];
  visibleTagIds: Set<string>;
  onToggleTag: (tagId: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  onShowOnlyTag: (tagId: string) => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';
  isMobile?: boolean;
}

export function TagFlatList({
  nodes,
  allTags,
  visibleTagIds,
  onToggleTag,
  onDeleteTag,
  onShowOnlyTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  getGroupVisibility,
  isMobile,
}: TagFlatListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [openPopoverTagId, setOpenPopoverTagId] = useState<string | null>(null);
  const [localNodes, setLocalNodes] = useState<TagTreeNode[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const displayedNodes = localNodes ?? nodes;
  const rootIds = useMemo(() => displayedNodes.map((node) => node.tag.id), [displayedNodes]);
  const activeTreeTag = useMemo(
    () => (activeId ? findTreeTag(displayedNodes, activeId) : null),
    [activeId, displayedNodes],
  );

  const groupOptions = useMemo<GroupOption[]>(
    () =>
      displayedNodes.map((node) => ({
        id: node.tag.id,
        name: node.tag.name,
        color: node.tag.color,
        icon: node.tag.icon,
      })),
    [displayedNodes],
  );

  const reorderMutation = useReorderTags();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: isMobile ? Number.POSITIVE_INFINITY : 8 },
    }),
  );

  const toggleGroupCollapse = useCallback((tagId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setOpenPopoverTagId(null);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);

      if (!over) return;

      const nextTree = moveTagTree(displayedNodes, active.id as string, over.id as string);
      if (!nextTree) return;

      setLocalNodes(nextTree);
      reorderMutation.mutate(
        { updates: buildTagHierarchyUpdates(nextTree) },
        {
          onSettled: () => {
            setLocalNodes(null);
          },
        },
      );
    },
    [displayedNodes, reorderMutation],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  if (isMobile) {
    return (
      <div role="list" className="space-y-1">
        {displayedNodes.map((node) => (
          <TagTreeItem
            key={node.tag.id}
            node={node}
            allTags={allTags}
            visibleTagIds={visibleTagIds}
            groupOptions={groupOptions}
            collapsed={collapsedGroups.has(node.tag.id)}
            activeTreeTag={null}
            activeDragId={null}
            isMobile
            onToggleTag={onToggleTag}
            onDeleteTag={onDeleteTag}
            onShowOnlyTag={onShowOnlyTag}
            onToggleGroupTags={onToggleGroupTags}
            onShowOnlyGroupTags={onShowOnlyGroupTags}
            getGroupVisibility={getGroupVisibility}
            openPopoverTagId={openPopoverTagId}
            onOpenPopover={setOpenPopoverTagId}
            onToggleCollapse={() => toggleGroupCollapse(node.tag.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={preferSmallestCollision}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <DroppableArea id={ROOT} role="list" className="space-y-1 rounded-xl">
          {displayedNodes.map((node) => (
            <TagTreeItem
              key={node.tag.id}
              node={node}
              allTags={allTags}
              visibleTagIds={visibleTagIds}
              groupOptions={groupOptions}
              collapsed={collapsedGroups.has(node.tag.id)}
              activeTreeTag={activeTreeTag}
              activeDragId={activeId}
              isMobile={false}
              onToggleTag={onToggleTag}
              onDeleteTag={onDeleteTag}
              onShowOnlyTag={onShowOnlyTag}
              onToggleGroupTags={onToggleGroupTags}
              onShowOnlyGroupTags={onShowOnlyGroupTags}
              getGroupVisibility={getGroupVisibility}
              openPopoverTagId={openPopoverTagId}
              onOpenPopover={setOpenPopoverTagId}
              onToggleCollapse={() => toggleGroupCollapse(node.tag.id)}
            />
          ))}
        </DroppableArea>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeTreeTag ? (
          <div className="bg-card/90 text-foreground inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm">
            <TagIcon
              icon={activeTreeTag.tag.icon}
              color={resolveTagColor(activeTreeTag.tag.color)}
              size="sm"
            />
            <span className="truncate">{activeTreeTag.tag.name}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

interface TagTreeItemProps {
  node: TagTreeNode;
  allTags: Tag[];
  visibleTagIds: Set<string>;
  groupOptions: GroupOption[];
  collapsed: boolean;
  activeTreeTag: TreeTag | null;
  activeDragId: string | null;
  isMobile: boolean;
  onToggleTag: (tagId: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  onShowOnlyTag: (tagId: string) => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
  onToggleCollapse: () => void;
}

function TagTreeItem({
  node,
  allTags,
  visibleTagIds,
  groupOptions,
  collapsed,
  activeTreeTag,
  activeDragId,
  isMobile,
  onToggleTag,
  onDeleteTag,
  onShowOnlyTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  getGroupVisibility,
  openPopoverTagId,
  onOpenPopover,
  onToggleCollapse,
}: TagTreeItemProps) {
  if (node.children.length === 0) {
    return (
      <SortableTagItem
        tag={node.tag}
        allTags={allTags}
        checked={visibleTagIds.has(node.tag.id)}
        groupOptions={groupOptions.filter((group) => group.id !== node.tag.id)}
        currentParentId={null}
        isMobile={isMobile}
        dragKind="root"
        activeDragId={activeDragId}
        onToggle={() => onToggleTag(node.tag.id)}
        onDeleteTag={() => onDeleteTag(node.tag.id, node.tag.name)}
        onShowOnlyTag={() => onShowOnlyTag(node.tag.id)}
        openPopoverTagId={openPopoverTagId}
        onOpenPopover={onOpenPopover}
      />
    );
  }

  return (
    <SortableParentBlock
      node={node}
      allTags={allTags}
      visibleTagIds={visibleTagIds}
      groupOptions={groupOptions}
      collapsed={collapsed}
      activeTreeTag={activeTreeTag}
      activeDragId={activeDragId}
      isMobile={isMobile}
      onToggleTag={onToggleTag}
      onDeleteTag={onDeleteTag}
      onToggleGroupTags={onToggleGroupTags}
      onShowOnlyGroupTags={onShowOnlyGroupTags}
      getGroupVisibility={getGroupVisibility}
      openPopoverTagId={openPopoverTagId}
      onOpenPopover={onOpenPopover}
      onToggleCollapse={onToggleCollapse}
    />
  );
}

interface SortableParentBlockProps {
  node: TagTreeNode;
  allTags: Tag[];
  visibleTagIds: Set<string>;
  groupOptions: GroupOption[];
  collapsed: boolean;
  activeTreeTag: TreeTag | null;
  activeDragId: string | null;
  isMobile: boolean;
  onToggleTag: (tagId: string) => void;
  onDeleteTag: (tagId: string, tagName: string) => void;
  onToggleGroupTags: (tagIds: string[]) => void;
  onShowOnlyGroupTags: (tagIds: string[]) => void;
  getGroupVisibility: (tagIds: string[]) => 'all' | 'none' | 'some';
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
  onToggleCollapse: () => void;
}

function SortableParentBlock({
  node,
  allTags,
  visibleTagIds,
  groupOptions,
  collapsed,
  activeTreeTag,
  activeDragId,
  isMobile,
  onToggleTag,
  onDeleteTag,
  onToggleGroupTags,
  onShowOnlyGroupTags,
  getGroupVisibility,
  openPopoverTagId,
  onOpenPopover,
  onToggleCollapse,
}: SortableParentBlockProps) {
  const locale = useLocale();
  const router = useRouter();
  const updateTagMutation = useUpdateTag();
  const createTagMutation = useCreateTag();
  const { openTagRenameModal } = useTagModalNavigation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    index,
    activeIndex,
    overIndex,
  } = useSortable({
    id: node.tag.id,
    disabled: isMobile,
  });
  const { displayColor } = useFilterItemEdit({
    tagId: node.tag.id,
    initialColor: node.tag.color ?? undefined,
  });

  const [isCreatingChild, setIsCreatingChild] = useState(false);

  const groupTagIds = useMemo(
    () => [node.tag.id, ...node.children.map((child) => child.id)],
    [node.children, node.tag.id],
  );
  const groupVisibility = getGroupVisibility(groupTagIds);
  const headerIcon = node.tag.icon ?? node.children[0]?.icon ?? null;
  const isPopoverOpen = openPopoverTagId === node.tag.id;
  const canDropChildHere =
    !!activeTreeTag && activeTreeTag.tag.id !== node.tag.id && canBecomeChild(activeTreeTag);
  // collapsed でも drag 中は drop 先として残す（reparent を ungroup と誤認させない）
  const shouldShowChildContainer = !collapsed || (!!activeDragId && canDropChildHere);

  const isInternalDropHere = overIndex === index && activeIndex !== overIndex && activeIndex >= 0;
  const isForeignDropHere = overIndex === index && activeIndex < 0;
  const showDropLine = !isMobile && (isInternalDropHere || isForeignDropHere);
  const dropLineEdge: 'top' | 'bottom' | null = !showDropLine
    ? null
    : isForeignDropHere
      ? 'top'
      : activeIndex < overIndex
        ? 'bottom'
        : 'top';

  const style = isMobile
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
      };

  return (
    <div
      style={style}
      className={cn(!isMobile && isDragging && 'pointer-events-none opacity-0')}
      role="listitem"
    >
      <div ref={setNodeRef} className="relative" {...attributes} {...listeners}>
        {dropLineEdge ? (
          <div
            aria-hidden
            className={cn(
              'bg-primary pointer-events-none absolute inset-x-0 z-10',
              dropLineEdge === 'top' ? 'top-0' : 'bottom-0',
            )}
            style={{ height: 'var(--border-indicator)' }}
          />
        ) : null}
        <div>
          <GroupHeader
            label={node.tag.name}
            checked={groupVisibility === 'all'}
            indeterminate={groupVisibility === 'some'}
            collapsed={collapsed}
            displayColor={displayColor}
            isMobile={isMobile}
            onCheckedChange={() => onToggleGroupTags(groupTagIds)}
            onToggleCollapse={onToggleCollapse}
            onShowOnlyGroup={() => onShowOnlyGroupTags(groupTagIds)}
            onColorChange={(color) => {
              groupTagIds.forEach((tagId) => {
                updateTagMutation.mutate({ id: tagId, color });
              });
            }}
            onIconChange={(icon) => updateTagMutation.mutate({ id: node.tag.id, icon })}
            currentIcon={headerIcon}
            onAddTagToGroup={() => setIsCreatingChild(true)}
            onRenameGroup={() =>
              openTagRenameModal({
                id: node.tag.id,
                name: node.tag.name,
                parent_id: node.tag.parent_id ?? null,
              })
            }
            onViewStats={() => router.push(`/${locale}/stats/tags/${node.tag.id}`)}
            onDeleteGroup={() => onDeleteTag(node.tag.id, node.tag.name)}
            onRowClick={() => onOpenPopover(node.tag.id)}
            highlighted={isPopoverOpen}
          />

          {isPopoverOpen ? (
            <TagEntryCreatePopover
              open
              onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? node.tag.id : null)}
              tag={{
                id: node.tag.id,
                name: node.tag.name,
                color: displayColor,
                icon: node.tag.icon ?? headerIcon,
              }}
              defaultDurationMinutes={30}
              isMobile={isMobile}
            />
          ) : null}

          <CreateTagPopover
            open={isCreatingChild}
            onOpenChange={setIsCreatingChild}
            initialParentId={node.tag.id}
            existingTags={allTags}
            onSubmit={async (input) => {
              await createTagMutation.mutateAsync({
                name: input.name,
                color: input.color,
                parentId: input.parentId,
                ...(input.icon ? { icon: input.icon } : {}),
              });
              setIsCreatingChild(false);
            }}
          />
        </div>
      </div>

      {shouldShowChildContainer ? (
        <SortableContext
          items={node.children.map((child) => child.id)}
          strategy={verticalListSortingStrategy}
        >
          <DroppableArea
            id={childContainerId(node.tag.id)}
            className={cn(
              'ml-4 space-y-1 rounded-xl border border-dashed border-transparent px-1 py-1',
              activeDragId && canDropChildHere && 'bg-muted/30',
            )}
          >
            {!collapsed
              ? node.children.map((child) => (
                  <SortableTagItem
                    key={child.id}
                    tag={child}
                    allTags={allTags}
                    checked={visibleTagIds.has(child.id)}
                    groupOptions={groupOptions.filter((group) => group.id !== child.id)}
                    currentParentId={node.tag.id}
                    isMobile={isMobile}
                    dragKind="child"
                    activeDragId={activeDragId}
                    onToggle={() => onToggleTag(child.id)}
                    onDeleteTag={() => onDeleteTag(child.id, child.name)}
                    onShowOnlyTag={() => onShowOnlyGroupTags([child.id])}
                    openPopoverTagId={openPopoverTagId}
                    onOpenPopover={onOpenPopover}
                  />
                ))
              : null}
          </DroppableArea>
        </SortableContext>
      ) : null}
    </div>
  );
}

interface SortableTagItemProps {
  tag: Tag;
  allTags: Tag[];
  checked: boolean;
  groupOptions: GroupOption[];
  currentParentId: string | null;
  isMobile: boolean;
  dragKind: 'root' | 'child';
  activeDragId: string | null;
  onToggle: () => void;
  onDeleteTag: () => void;
  onShowOnlyTag: () => void;
  openPopoverTagId: string | null;
  onOpenPopover: (tagId: string | null) => void;
}

function SortableTagItem({
  tag,
  allTags,
  checked,
  groupOptions,
  currentParentId,
  isMobile,
  onToggle,
  onDeleteTag,
  onShowOnlyTag,
  openPopoverTagId,
  onOpenPopover,
}: SortableTagItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    index,
    activeIndex,
    overIndex,
  } = useSortable({
    id: tag.id,
    disabled: isMobile,
  });
  const updateTagMutation = useUpdateTag();
  const mergeTagMutation = useMergeTag();
  const { openTagMergeModal, openTagRenameModal } = useTagModalNavigation();
  const { displayColor, handleColorChange, handleIconChange } = useFilterItemEdit({
    tagId: tag.id,
    initialColor: tag.color ?? undefined,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [groupChangeConflict, setGroupChangeConflict] = useState<{
    targetTagId: string;
    targetName: string;
  } | null>(null);

  const isPopoverOpen = openPopoverTagId === tag.id;
  const style = isMobile
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
      };

  const isInternalDropHere = overIndex === index && activeIndex !== overIndex && activeIndex >= 0;
  const isForeignDropHere = overIndex === index && activeIndex < 0;
  const showDropLine = !isMobile && (isInternalDropHere || isForeignDropHere);
  const dropLineEdge: 'top' | 'bottom' | null = !showDropLine
    ? null
    : isForeignDropHere
      ? 'top'
      : activeIndex < overIndex
        ? 'bottom'
        : 'top';

  const handleChangeParent = useCallback(
    (newParentId: string | null) => {
      const conflict = allTags.find(
        (candidate) =>
          candidate.id !== tag.id &&
          candidate.parent_id === newParentId &&
          candidate.name.toLowerCase() === tag.name.toLowerCase(),
      );

      if (conflict) {
        setGroupChangeConflict({
          targetTagId: conflict.id,
          targetName: conflict.name,
        });
        return;
      }

      updateTagMutation.mutate({ id: tag.id, parentId: newParentId });
    },
    [allTags, tag.id, tag.name, updateTagMutation],
  );

  const handleConfirmGroupChangeMerge = useCallback(async () => {
    if (!groupChangeConflict) return;
    try {
      await mergeTagMutation.mutateAsync({
        sourceTagId: tag.id,
        targetTagId: groupChangeConflict.targetTagId,
      });
    } finally {
      setGroupChangeConflict(null);
    }
  }, [groupChangeConflict, mergeTagMutation, tag.id]);

  return (
    <>
      <div className="space-y-1" role="listitem">
        <div
          ref={setNodeRef}
          style={style}
          className={cn('relative', !isMobile && isDragging && 'pointer-events-none opacity-0')}
          {...attributes}
          {...listeners}
        >
          {dropLineEdge ? (
            <div
              aria-hidden
              className={cn(
                'bg-primary pointer-events-none absolute inset-x-0 z-10',
                dropLineEdge === 'top' ? 'top-0' : 'bottom-0',
              )}
              style={{ height: 'var(--border-indicator)' }}
            />
          ) : null}
          <div
            className={cn(
              'group/item relative flex cursor-pointer items-center rounded-lg text-sm',
              isMobile ? 'h-11' : 'h-8',
              'hover:bg-state-hover',
              menuOpen && 'bg-state-selected',
              isPopoverOpen && 'bg-state-selected',
              !checked && 'opacity-50',
            )}
            onClick={() => onOpenPopover(tag.id)}
          >
            <span className="ml-2 shrink-0">
              <TagIcon icon={tag.icon} color={displayColor} size="sm" />
            </span>

            <HoverTooltip
              content={tag.name}
              side="top"
              disabled={menuOpen}
              wrapperClassName="ml-2 min-w-0 flex-1"
            >
              <span className="min-w-0 truncate">{tag.name}</span>
            </HoverTooltip>

            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={checked ? t('calendar.filter.hide') : t('calendar.filter.show')}
              className={cn(
                "text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-['']",
                checked ? 'opacity-0 group-hover/item:opacity-100' : 'opacity-100',
                isMobile && 'opacity-100',
              )}
            >
              {checked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
            </button>

            <div className="w-1 shrink-0" />

            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('calendar.filter.tagMenu')}
                  className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-hover/item:opacity-100 [@media(hover:none)]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <FilterItemMenu
                displayColor={displayColor}
                currentIcon={tag.icon}
                currentGroup={currentParentId}
                currentTagId={tag.id}
                groupOptions={groupOptions}
                isGrouped={currentParentId !== null}
                isMobile={isMobile}
                onOpenRenameDialog={() =>
                  openTagRenameModal({
                    id: tag.id,
                    name: tag.name,
                    parent_id: tag.parent_id ?? null,
                  })
                }
                onColorChange={handleColorChange}
                onIconChange={handleIconChange}
                onChangeGroup={handleChangeParent}
                onOpenMergeModal={() =>
                  openTagMergeModal({ id: tag.id, name: tag.name, color: tag.color ?? null })
                }
                onShowOnlyTag={onShowOnlyTag}
                onViewStats={() => router.push(`/${locale}/stats/tags/${tag.id}`)}
                onDeleteTag={onDeleteTag}
              />
            </DropdownMenu>

            {isPopoverOpen ? (
              <TagEntryCreatePopover
                open
                onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? tag.id : null)}
                tag={{ id: tag.id, name: tag.name, color: displayColor, icon: tag.icon }}
                defaultDurationMinutes={30}
                isMobile={isMobile}
              />
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={groupChangeConflict !== null}
        onClose={() => setGroupChangeConflict(null)}
        onConfirm={handleConfirmGroupChangeMerge}
        title={t('calendar.filter.mergeTag.title')}
        description={
          groupChangeConflict
            ? t('calendar.filter.mergeTag.description', {
                sourceName: tag.name,
                targetName: groupChangeConflict.targetName,
              })
            : ''
        }
        confirmLabel={t('calendar.filter.mergeTag.confirm')}
        variant="destructive"
      />
    </>
  );
}

function DroppableArea({
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

  return (
    <div ref={setNodeRef} role={role} className={cn('relative', className)}>
      {children}
      {isOver ? (
        <div
          aria-hidden
          className="bg-primary pointer-events-none absolute inset-x-0 bottom-0 z-10"
          style={{ height: 'var(--border-indicator)' }}
        />
      ) : null}
    </div>
  );
}
