'use client';

import {
  BarChart3,
  Check,
  FolderUp,
  Merge,
  MoreHorizontal,
  Palette,
  Pencil,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { Tag, TagColorName } from '@/features/tags';
import {
  ColorPaletteMenuItems,
  IconPickerDropdownItems,
  resolveTagColor,
  TagIcon,
  useUpdateTag,
} from '@/features/tags';
import { useShellStore } from '@/lib/stores/useShellStore';
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface GroupOption {
  id: string;
  name: string;
  color: string | null;
  icon?: string | null;
}

interface ReviewTagActionsMenuProps {
  tag: Tag;
  groupOptions: GroupOption[];
  onNavigateToTag: (tagId: string) => void;
  onRequestDelete: (tag: Tag) => void;
  triggerClassName?: string | undefined;
  contentSide?: 'top' | 'right' | 'bottom' | 'left' | undefined;
  contentAlign?: 'start' | 'center' | 'end' | undefined;
}

export function ReviewTagActionsMenu({
  tag,
  groupOptions,
  onNavigateToTag,
  onRequestDelete,
  triggerClassName,
  contentSide = 'right',
  contentAlign = 'start',
}: ReviewTagActionsMenuProps) {
  const t = useTranslations();
  const updateTagMutation = useUpdateTag();
  const openTagRenameModal = useShellStore.use.openTagRenameModal();
  const openTagMergeModal = useShellStore.use.openTagMergeModal();

  const parentOptions = groupOptions.filter((group) => group.id !== tag.id);
  const currentGroup = tag.parent_id ?? null;
  const isGrouped = currentGroup !== null;
  const displayColor = resolveTagColor(tag.color);

  const handleColorChange = (color: TagColorName) => {
    updateTagMutation.mutate({ id: tag.id, color });
  };

  const handleIconChange = (icon: string | null) => {
    updateTagMutation.mutate({ id: tag.id, icon });
  };

  const handleChangeGroup = (parentId: string | null) => {
    updateTagMutation.mutate({ id: tag.id, parentId });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('calendar.filter.tagMenu')}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity',
            triggerClassName,
          )}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={contentAlign} side={contentSide}>
        <DropdownMenuItem
          onClick={() =>
            openTagRenameModal({
              id: tag.id,
              name: tag.name,
              parent_id: tag.parent_id ?? null,
            })
          }
        >
          <Pencil className="mr-2 size-4" />
          {t('calendar.filter.rename')}
        </DropdownMenuItem>

        {!isGrouped && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="mr-2 size-4" />
              {t('calendar.filter.changeColor')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent onClick={(event) => event.stopPropagation()}>
              <ColorPaletteMenuItems
                selectedColor={displayColor}
                onColorSelect={handleColorChange}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Smile className="mr-2 size-4" />
            {t('calendar.filter.changeIcon')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto p-2">
            <IconPickerDropdownItems value={tag.icon ?? null} onChange={handleIconChange} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {groupOptions.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderUp className="mr-2 size-4" />
              {t('calendar.filter.changeGroup')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => handleChangeGroup(null)}
                className={!currentGroup ? 'bg-state-selected' : undefined}
              >
                <X className="text-muted-foreground mr-2 size-4" />
                <span className="flex-1">{t('calendar.filter.noGroup')}</span>
                {!currentGroup && <Check className="text-muted-foreground ml-2 size-4" />}
              </DropdownMenuItem>

              {parentOptions.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {parentOptions.map((group) => {
                    const isCurrent = currentGroup === group.id;
                    return (
                      <DropdownMenuItem
                        key={group.id}
                        onClick={() => handleChangeGroup(group.id)}
                        className={isCurrent ? 'bg-state-selected' : undefined}
                      >
                        <TagIcon
                          icon={group.icon}
                          color={group.color}
                          size="sm"
                          className="mr-2 shrink-0"
                        />
                        <span className="flex-1">{group.name}</span>
                        {isCurrent && <Check className="text-muted-foreground ml-2 size-4" />}
                      </DropdownMenuItem>
                    );
                  })}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={() =>
            openTagMergeModal({ id: tag.id, name: tag.name, color: tag.color ?? null })
          }
        >
          <Merge className="mr-2 size-4" />
          {t('calendar.filter.merge')}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => onNavigateToTag(tag.id)}>
          <BarChart3 className="mr-2 size-4" />
          {t('calendar.filter.viewStats')}
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onRequestDelete(tag)}>
          <Trash2 className="mr-2 size-4" />
          {t('common.actions.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
