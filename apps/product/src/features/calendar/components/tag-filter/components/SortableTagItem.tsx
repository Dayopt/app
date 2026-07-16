'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useLocale, useTranslations } from 'next-intl';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';
import type { Tag } from '@/features/tags';
import { TagIcon, useMergeTag, useUpdateTag } from '@/features/tags';
import { DropdownMenu, DropdownMenuTrigger, HoverTooltip, cn } from '@dayopt/components';

import { useCalendarNavigation } from '../../../hooks/navigation/CalendarNavigationContext';
import { useTagModalNavigation } from '../../../hooks/useTagModalNavigation';
import { buildCalendarReviewPanelPath } from '../../../lib/panel-url';

import { FilterItemMenu, type GroupOption } from './FilterItem/FilterItemMenu';
import { useFilterItemEdit } from './FilterItem/useFilterItemEdit';
import { DroppableArea } from './TagFlatListDnd';
import { TagTimeblockCreatePopover } from './TagTimeblockCreatePopover';
import { childContainerId } from './move-tag-tree';

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

export function SortableTagItem({
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
  // （TimeblockCard と同じ「後ろに薄く残る」見え方）
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
              <span className={cn('min-w-0 truncate', !checked && 'text-muted-foreground')}>
                {tag.name}
              </span>
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
                // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
                "text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:outline-none",
                checked
                  ? 'opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100'
                  : 'opacity-100',
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
                  // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
                  className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
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
                onViewStats={() => {
                  if (navigation) {
                    navigation.setPanelKind('review', { reviewTagId: tag.id });
                    return;
                  }

                  router.push(buildCalendarReviewPanelPath(locale, reviewDate, tag.id));
                }}
                onDeleteTag={onDeleteTag}
              />
            </DropdownMenu>

            {isPopoverOpen ? (
              <TagTimeblockCreatePopover
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
              'ml-4 h-4 rounded-lg border border-dashed border-transparent',
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
