'use client';

import { useCallback, useMemo, useState } from 'react';

import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';

import { cn, overlaySurface } from '@dayopt/components';

import type { Tag, TagTreeNode } from '@/features/tags';
import {
  TagIcon,
  buildTagHierarchyUpdates,
  resolveTagColor,
  useReorderTags,
} from '@/features/tags';

import type { GroupOption } from './FilterItem/FilterItemMenu';
import { SortableParentBlock } from './SortableParentBlock';
import { SortableTagItem } from './SortableTagItem';
import {
  DroppableArea,
  EndOfRootDropZone,
  noopSortingStrategy,
  preferSmallestCollision,
  snapCenterToCursor,
} from './TagFlatListDnd';
import { ROOT, type TreeTag, canBecomeChild, findTreeTag, moveTagTree } from './move-tag-tree';

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
      <SortableContext items={rootIds} strategy={noopSortingStrategy}>
        <DroppableArea id={ROOT} role="list" className="space-y-1 rounded-lg">
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
          {/* drag 中のみ末尾 drop zone を出現させる。常時表示すると静止時に
              余白が広がって見えるため、active 時のみで十分 */}
          {activeId ? <EndOfRootDropZone /> : null}
        </DroppableArea>
      </SortableContext>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeTreeTag ? (
          <div className={cn(overlaySurface(), 'inline-flex items-center gap-2 px-2 py-1 text-sm')}>
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
        canAcceptChildren={
          !isMobile &&
          !!activeTreeTag &&
          activeTreeTag.tag.id !== node.tag.id &&
          canBecomeChild(activeTreeTag)
        }
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
