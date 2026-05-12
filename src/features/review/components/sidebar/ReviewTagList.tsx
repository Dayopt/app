'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { BarChart3, ChevronDown, ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import type { CollisionDetection, DragEndEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS, getEventCoordinates } from '@dnd-kit/utilities';

import type { Tag, TagTreeNode } from '@/features/tags';
import {
  buildTagHierarchyUpdates,
  flattenTagTree,
  TagDeleteStrategyDialog,
  TagIcon,
  useDeleteTag,
  useReorderTags,
  useTagsHierarchy,
} from '@/features/tags';
import { SidebarSection } from '@/lib/components/shell/sidebar';
import { Skeleton } from '@/lib/components/ui/skeleton';
import { HoverTooltip } from '@/lib/components/ui/tooltip';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { useReviewFilterStore } from '../../stores/useReviewFilterStore';
import { ReviewTagActionsMenu } from '../ReviewTagActionsMenu';

const ROOT = '__review_tag_root__';
const END_OF_ROOT = '__review_tag_root_end__';

function childContainerId(parentId: string): string {
  return `review-tag-children:${parentId}`;
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

const noopSortingStrategy: SortingStrategy = () => null;

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
  const activeId = args.active?.id;
  const ownChildContainerId = typeof activeId === 'string' ? childContainerId(activeId) : null;
  const exclude = (id: unknown) => ownChildContainerId !== null && id === ownChildContainerId;

  const pointerCollisions = pointerWithin(args).filter((collision) => !exclude(collision.id));
  if (pointerCollisions.length > 0) {
    return [...pointerCollisions].sort((a, b) => {
      const aRect = args.droppableRects.get(a.id);
      const bRect = args.droppableRects.get(b.id);
      if (!aRect || !bRect) return 0;
      return aRect.width * aRect.height - bRect.width * bRect.height;
    });
  }

  return closestCorners(args).filter((collision) => !exclude(collision.id));
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
  return { kind: 'child', tag: child, parentId: parent.tag.id };
}

function findContainer(nodes: TagTreeNode[], id: string): string | null {
  if (id === ROOT || id === END_OF_ROOT) return ROOT;
  if (id.startsWith('review-tag-children:')) return id;
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
  if (activeId === overId) return null;

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
    const isRootContainer = overId === ROOT || overId === END_OF_ROOT;
    const overRootIndex = isRootContainer ? -1 : findRootIndex(nextNodes, overId);
    const rawIndex = isRootContainer || overRootIndex < 0 ? nextNodes.length : overRootIndex;
    const safeIndex = Math.max(0, Math.min(rawIndex, nextNodes.length));

    if (movingRoot) {
      nextNodes.splice(safeIndex, 0, movingRoot);
      return nextNodes;
    }

    if (!movingChild) return null;
    nextNodes.splice(safeIndex, 0, {
      tag: { ...movingChild, parent_id: null },
      children: [],
    });
    return nextNodes;
  }

  const targetParentId = destinationContainer.replace(/^review-tag-children:/, '');
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

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function findActiveTagId(pathname: string): string | null {
  const match = pathname.match(/\/review\/tags\/([^/?#]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function buildReviewTagPath(
  locale: string,
  tagId: string,
  date: Date,
  granularity: string,
): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review/tags/${tagId}?${params.toString()}`;
}

function buildReviewPath(locale: string, date: Date, granularity: string): string {
  const params = new URLSearchParams({
    g: granularity,
    d: formatDateParam(date),
  });
  return `/${locale}/review?${params.toString()}`;
}

interface TagRowProps {
  tag: Tag;
  depth: 0 | 1;
  active: boolean;
  hasChildren?: boolean | undefined;
  collapsed?: boolean | undefined;
  onNavigate: (tagId: string) => void;
  groupOptions: { id: string; name: string; color: string | null; icon?: string | null }[];
  onRequestDelete: (tag: Tag) => void;
  onToggleCollapse?: (() => void) | undefined;
}

function TagRow({
  tag,
  depth: _depth,
  active,
  hasChildren = false,
  collapsed = false,
  onNavigate,
  groupOptions,
  onRequestDelete,
  onToggleCollapse,
}: TagRowProps) {
  const t = useTranslations('calendar.filter');

  return (
    <div
      className={cn(
        'group/tag relative flex h-8 min-w-0 cursor-pointer items-center rounded-lg text-sm transition-colors duration-150 [@media(pointer:coarse)]:min-h-11',
        active
          ? 'bg-state-selected text-foreground'
          : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
      )}
      onClick={() => onNavigate(tag.id)}
    >
      <span className="ml-2 shrink-0">
        <TagIcon icon={tag.icon} color={tag.color} size="sm" />
      </span>

      <HoverTooltip content={tag.name} side="top" wrapperClassName="ml-2 min-w-0 flex-1">
        <span className={cn('min-w-0 truncate', active && 'font-normal')}>{tag.name}</span>
      </HoverTooltip>

      {hasChildren ? (
        <>
          <button
            type="button"
            className="hover:bg-state-hover ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg"
            aria-label={collapsed ? t('expand') : t('collapse')}
            onClick={(event) => {
              event.stopPropagation();
              onToggleCollapse?.();
            }}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
          <ReviewTagActionsMenu
            tag={tag}
            groupOptions={groupOptions}
            onNavigateToTag={onNavigate}
            onRequestDelete={onRequestDelete}
            triggerClassName="pointer-events-none absolute top-1/2 right-7 -translate-y-1/2 opacity-0 group-hover/tag:pointer-events-auto group-hover/tag:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
          />
        </>
      ) : (
        <ReviewTagActionsMenu
          tag={tag}
          groupOptions={groupOptions}
          onNavigateToTag={onNavigate}
          onRequestDelete={onRequestDelete}
          triggerClassName="pointer-events-none absolute top-1/2 right-0 -translate-y-1/2 opacity-0 group-hover/tag:pointer-events-auto group-hover/tag:opacity-100 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
        />
      )}
    </div>
  );
}

interface TagGroupProps {
  node: TagTreeNode;
  activeTagId: string | null;
  collapsed: boolean;
  activeTreeTag: TreeTag | null;
  activeDragId: string | null;
  onNavigate: (tagId: string) => void;
  groupOptions: { id: string; name: string; color: string | null; icon?: string | null }[];
  onRequestDelete: (tag: Tag) => void;
  onToggleCollapse: () => void;
}

function TagGroup({
  node,
  activeTagId,
  collapsed,
  activeTreeTag,
  activeDragId,
  onNavigate,
  groupOptions,
  onRequestDelete,
  onToggleCollapse,
}: TagGroupProps) {
  const hasChildren = node.children.length > 0;
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
  } = useSortable({ id: node.tag.id });
  const canDropChildHere =
    !!activeTreeTag && activeTreeTag.tag.id !== node.tag.id && canBecomeChild(activeTreeTag);
  const shouldShowChildContainer = !collapsed || (!!activeDragId && canDropChildHere);
  const shouldRenderChildContainer = hasChildren
    ? shouldShowChildContainer
    : !!activeDragId && canDropChildHere;
  const showDropLine = overIndex === index && activeIndex !== overIndex;
  const style = {
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div style={style} role="listitem" className={cn('min-w-0', isDragging && 'opacity-30')}>
      <div ref={setNodeRef} className="relative" {...attributes} {...listeners}>
        {showDropLine ? (
          <div
            aria-hidden
            className="bg-primary pointer-events-none absolute inset-x-0 top-0 z-10"
            style={{ height: 'var(--border-indicator)' }}
          />
        ) : null}
        <TagRow
          tag={node.tag}
          depth={0}
          active={activeTagId === node.tag.id}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onNavigate={onNavigate}
          groupOptions={groupOptions}
          onRequestDelete={onRequestDelete}
          onToggleCollapse={onToggleCollapse}
        />
      </div>
      {shouldRenderChildContainer ? (
        <SortableContext
          items={node.children.map((child) => child.id)}
          strategy={noopSortingStrategy}
        >
          <DroppableArea
            id={childContainerId(node.tag.id)}
            role="list"
            className={cn(
              'mt-1 ml-4 rounded-xl border border-dashed border-transparent',
              hasChildren ? 'space-y-1 px-1 py-1' : 'h-4',
              activeDragId && canDropChildHere && 'bg-muted/30',
            )}
          >
            {!collapsed
              ? node.children.map((child) => (
                  <SortableChildTagRow
                    key={child.id}
                    tag={child}
                    active={activeTagId === child.id}
                    onNavigate={onNavigate}
                    groupOptions={groupOptions}
                    onRequestDelete={onRequestDelete}
                  />
                ))
              : null}
          </DroppableArea>
        </SortableContext>
      ) : null}
    </div>
  );
}

function SortableChildTagRow({
  tag,
  active,
  onNavigate,
  groupOptions,
  onRequestDelete,
}: {
  tag: Tag;
  active: boolean;
  onNavigate: (tagId: string) => void;
  groupOptions: { id: string; name: string; color: string | null; icon?: string | null }[];
  onRequestDelete: (tag: Tag) => void;
}) {
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
  } = useSortable({ id: tag.id });
  const showDropLine = overIndex === index && activeIndex !== overIndex;
  const style = {
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
    transition,
  };

  return (
    <div role="listitem" className="space-y-1">
      <div
        ref={setNodeRef}
        style={style}
        className={cn('relative', isDragging && 'opacity-30')}
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
        <TagRow
          tag={tag}
          depth={1}
          active={active}
          onNavigate={onNavigate}
          groupOptions={groupOptions}
          onRequestDelete={onRequestDelete}
        />
      </div>
    </div>
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

function OverallRow({ active, onNavigate }: { active: boolean; onNavigate: () => void }) {
  const t = useTranslations('calendar.stats');

  return (
    <button
      type="button"
      className={cn(
        'flex h-8 w-full min-w-0 cursor-pointer items-center rounded-lg text-sm transition-colors duration-150 [@media(pointer:coarse)]:min-h-11',
        active
          ? 'bg-state-selected text-foreground'
          : 'text-muted-foreground hover:bg-state-hover hover:text-foreground',
      )}
      onClick={onNavigate}
    >
      <span className="ml-2 shrink-0">
        <BarChart3 className="size-4" aria-hidden />
      </span>
      <span className={cn('ml-2 min-w-0 flex-1 truncate text-left', active && 'font-normal')}>
        {t('overall')}
      </span>
      <div className="w-1 shrink-0" />
    </button>
  );
}

/**
 * Review Sidebar 用タグナビゲーション。
 *
 * Calendar のタグ階層を同じ順序で表示し、クリックでタグ単体の統計に遷移する。
 */
export function ReviewTagList() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const granularity = useReviewFilterStore((s) => s.granularity);
  const { data: nodes, isLoading } = useTagsHierarchy();
  const { data: tagStats, isError: isTagStatsError } = api.entries.getTagStats.useQuery();
  const deleteTagMutation = useDeleteTag();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [localNodes, setLocalNodes] = useState<TagTreeNode[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    entryCount: number;
  } | null>(null);

  const activeTagId = useMemo(() => findActiveTagId(pathname), [pathname]);
  const isOverallActive = activeTagId === null;
  const displayedNodes = useMemo(() => localNodes ?? nodes ?? [], [localNodes, nodes]);
  const rootIds = useMemo(() => displayedNodes.map((node) => node.tag.id), [displayedNodes]);
  const activeTreeTag = useMemo(
    () => (activeId ? findTreeTag(displayedNodes, activeId) : null),
    [activeId, displayedNodes],
  );
  const tags = useMemo(() => flattenTagTree(displayedNodes), [displayedNodes]);
  const groupOptions = useMemo(
    () =>
      displayedNodes.map((node) => ({
        id: node.tag.id,
        name: node.tag.name,
        color: node.tag.color,
        icon: node.tag.icon,
      })),
    [displayedNodes],
  );
  const tagPlanCounts = useMemo(
    () => (isTagStatsError ? null : (tagStats?.counts ?? {})),
    [isTagStatsError, tagStats?.counts],
  );
  const reorderMutation = useReorderTags();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const handleOverallNavigate = () => {
    router.push(buildReviewPath(locale, currentDate, granularity));
  };

  const handleNavigate = (tagId: string) => {
    router.push(buildReviewTagPath(locale, tagId, currentDate, granularity));
  };

  const handleRequestDelete = useCallback(
    (tag: Tag) => {
      const entryCount = tagPlanCounts === null ? 1 : (tagPlanCounts[tag.id] ?? 0);
      if (entryCount === 0) {
        deleteTagMutation.mutate({ id: tag.id });
      } else {
        setDeleteTarget({ id: tag.id, name: tag.name, entryCount });
      }
    },
    [deleteTagMutation, tagPlanCounts],
  );

  const handleConfirmDelete = async (
    strategy: 'delete_entries' | 'reassign',
    targetTagId?: string,
  ) => {
    if (!deleteTarget) return;
    try {
      await deleteTagMutation.mutateAsync({
        id: deleteTarget.id,
        strategy,
        targetTagId,
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const availableTagsForReassign = useMemo(
    () => tags.filter((tag) => tag.id !== deleteTarget?.id),
    [deleteTarget?.id, tags],
  );

  const toggleGroupCollapse = (tagId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
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

  return (
    <>
      <div className="w-full min-w-0 space-y-2 overflow-hidden">
        <div className="px-0 py-1">
          <OverallRow active={isOverallActive} onNavigate={handleOverallNavigate} />
        </div>
        <SidebarSection title={t('calendar.filter.tags')} className="py-1">
          {isLoading ? (
            <div className="space-y-1 py-1">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : displayedNodes.length > 0 ? (
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
                    <TagGroup
                      key={node.tag.id}
                      node={node}
                      activeTagId={activeTagId}
                      collapsed={collapsedGroups.has(node.tag.id)}
                      activeTreeTag={activeTreeTag}
                      activeDragId={activeId}
                      onNavigate={handleNavigate}
                      groupOptions={groupOptions}
                      onRequestDelete={handleRequestDelete}
                      onToggleCollapse={() => toggleGroupCollapse(node.tag.id)}
                    />
                  ))}
                  {activeId ? <EndOfRootDropZone /> : null}
                </DroppableArea>
              </SortableContext>

              <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
                {activeTreeTag ? (
                  <div className="bg-card text-foreground border-border-subtle shadow-card inline-flex items-center gap-2 rounded-lg border px-2 py-1 text-sm">
                    <TagIcon
                      icon={activeTreeTag.tag.icon}
                      color={activeTreeTag.tag.color}
                      size="sm"
                    />
                    <span className="truncate">{activeTreeTag.tag.name}</span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : (
            <div className="text-muted-foreground px-2 py-2 text-xs">
              {t('calendar.filter.noTags')}
            </div>
          )}
        </SidebarSection>
      </div>
      <TagDeleteStrategyDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        tagName={deleteTarget?.name ?? ''}
        entryCount={deleteTarget?.entryCount ?? 0}
        availableTags={availableTagsForReassign}
      />
    </>
  );
}
