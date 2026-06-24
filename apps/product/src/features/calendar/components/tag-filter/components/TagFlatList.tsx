'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import type { CollisionDetection, DragEndEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
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
import type { SortingStrategy } from '@dnd-kit/sortable';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import type { Tag, TagTreeNode } from '@/features/tags';
import {
  TagIcon,
  buildTagHierarchyUpdates,
  resolveTagColor,
  useMergeTag,
  useReorderTags,
  useUpdateTag,
} from '@/features/tags';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuTrigger, HoverTooltip } from '@dayopt/components';

import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';
import { buildCalendarReviewPanelPath } from '../../../lib/panel-url';

import { FilterItemMenu, type GroupOption } from './FilterItem/FilterItemMenu';
import { useFilterItemEdit } from './FilterItem/useFilterItemEdit';
import { GroupHeader } from './GroupHeader';
import { TagEntryCreatePopover } from './TagEntryCreatePopover';
import {
  END_OF_ROOT,
  ROOT,
  type TreeTag,
  canBecomeChild,
  childContainerId,
  findTreeTag,
  moveTagTree,
} from './move-tag-tree';

// drag 中に他 item を動かさず、drop indicator 線だけで挿入位置を示す
const noopSortingStrategy: SortingStrategy = () => null;

// chip の中心をカーソルに吸い付ける（行頭固定だと chip が左に寄る）
const snapCenterToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  if (!activatorEvent || !draggingNodeRect) return transform;
  const coords = getEventCoordinates(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + coords.x - draggingNodeRect.left - draggingNodeRect.width / 2,
    y: transform.y + coords.y - draggingNodeRect.top - draggingNodeRect.height / 2,
  };
};

const preferSmallestCollision: CollisionDetection = (args) => {
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
          {/* drag 中のみ末尾 drop zone を出現させる。常時表示すると静止時に
              余白が広がって見えるため、active 時のみで十分 */}
          {activeId ? <EndOfRootDropZone /> : null}
        </DroppableArea>
      </SortableContext>

      <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
        {activeTreeTag ? (
          <div className="bg-card text-foreground border-border-subtle shadow-card inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-sm">
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
  const navigation = useCalendarNavigation();
  const reviewDate = navigation?.currentDate ?? new Date();
  const updateTagMutation = useUpdateTag();
  const { openTagRenameModal, openTagCreateModal } = useTagModalNavigation();
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

  // moveTagTree は常に over item の直前に挿入するため、line は常に top edge
  const showDropLine = !isMobile && overIndex === index && activeIndex !== overIndex;

  // ドラッグ中は transform を打ち消し、source を原位置に opacity-30 で残す
  // （EntryCard と同じ「後ろに薄く残る」見え方）
  const style = isMobile
    ? undefined
    : {
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        transition,
      };

  return (
    <div
      style={style}
      className={cn(!isMobile && isDragging && 'pointer-events-none opacity-30')}
      role="listitem"
    >
      <div ref={setNodeRef} className="relative" {...attributes} {...listeners}>
        {showDropLine ? (
          <div
            aria-hidden
            className="bg-primary pointer-events-none absolute inset-x-0 top-0 z-10"
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
            onAddTagToGroup={() => openTagCreateModal({ initialParentId: node.tag.id })}
            onRenameGroup={() =>
              openTagRenameModal({
                id: node.tag.id,
                name: node.tag.name,
                parent_id: node.tag.parent_id ?? null,
              })
            }
            onViewStats={() =>
              router.push(buildCalendarReviewPanelPath(locale, reviewDate, node.tag.id))
            }
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
              isMobile={isMobile}
            />
          ) : null}
        </div>
      </div>

      {shouldShowChildContainer ? (
        <SortableContext
          items={node.children.map((child) => child.id)}
          strategy={noopSortingStrategy}
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
                    canAcceptChildren={false}
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
  canAcceptChildren: boolean;
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
  dragKind,
  activeDragId,
  canAcceptChildren,
  onToggle,
  onDeleteTag,
  onShowOnlyTag,
  openPopoverTagId,
  onOpenPopover,
}: SortableTagItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const navigation = useCalendarNavigation();
  const reviewDate = navigation?.currentDate ?? new Date();
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
  // ドラッグ中は transform を打ち消し、source を原位置に opacity-30 で残す
  // （EntryCard と同じ「後ろに薄く残る」見え方）
  const style = isMobile
    ? undefined
    : {
        transform: isDragging ? undefined : CSS.Translate.toString(transform),
        transition,
      };

  // moveTagTree は常に over item の直前に挿入するため、line は常に top edge
  const showDropLine = !isMobile && overIndex === index && activeIndex !== overIndex;

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
          className={cn('relative', !isMobile && isDragging && 'pointer-events-none opacity-30')}
          {...attributes}
          {...listeners}
        >
          {showDropLine ? (
            <div
              aria-hidden
              className="bg-primary pointer-events-none absolute inset-x-0 top-0 z-10"
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
                onViewStats={() =>
                  router.push(buildCalendarReviewPanelPath(locale, reviewDate, tag.id))
                }
                onDeleteTag={onDeleteTag}
              />
            </DropdownMenu>

            {isPopoverOpen ? (
              <TagEntryCreatePopover
                open
                onOpenChange={(nextOpen) => onOpenPopover(nextOpen ? tag.id : null)}
                tag={{ id: tag.id, name: tag.name, color: displayColor, icon: tag.icon }}
                isMobile={isMobile}
              />
            ) : null}
          </div>
        </div>

        {!isMobile && dragKind === 'root' && activeDragId !== null ? (
          <DroppableArea
            id={childContainerId(tag.id)}
            className={cn(
              'ml-4 h-4 rounded-xl border border-dashed border-transparent',
              canAcceptChildren ? 'bg-muted/30' : 'hidden',
            )}
          />
        ) : null}
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
function EndOfRootDropZone() {
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
