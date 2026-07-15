'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale } from 'next-intl';

import type { Tag, TagTreeNode } from '@/features/tags';
import { useUpdateTag } from '@/features/tags';
import { cn } from '@dayopt/components';

import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';
import { buildCalendarReviewPanelPath } from '../../../lib/panel-url';

import type { GroupOption } from './FilterItem/FilterItemMenu';
import { useFilterItemEdit } from './FilterItem/useFilterItemEdit';
import { GroupHeader } from './GroupHeader';
import { SortableTagItem } from './SortableTagItem';
import { DroppableArea, noopSortingStrategy } from './TagFlatListDnd';
import { TagTimeblockCreatePopover } from './TagTimeblockCreatePopover';
import { type TreeTag, canBecomeChild, childContainerId } from './move-tag-tree';

export interface SortableParentBlockProps {
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

export function SortableParentBlock({
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
  // （TimeblockCard と同じ「後ろに薄く残る」見え方）
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
            onViewStats={() => {
              if (navigation) {
                navigation.setPanelKind('review', { reviewTagId: node.tag.id });
                return;
              }

              router.push(buildCalendarReviewPanelPath(locale, reviewDate, node.tag.id));
            }}
            onDeleteGroup={() => onDeleteTag(node.tag.id, node.tag.name)}
            onRowClick={() => onOpenPopover(node.tag.id)}
            highlighted={isPopoverOpen}
          />

          {isPopoverOpen ? (
            <TagTimeblockCreatePopover
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
              'ml-4 space-y-1 rounded-lg border border-dashed border-transparent px-1 py-1',
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
