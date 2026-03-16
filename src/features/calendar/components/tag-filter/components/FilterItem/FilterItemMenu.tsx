'use client';

import { Eye, FolderUp, Merge, Palette, Pencil, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ColorPaletteMenuItems } from '@/components/ui/color-palette-picker';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { TagColorName } from '@/lib/tag-colors';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

export interface GroupOption {
  name: string;
  color: string | null;
}

interface FilterItemMenuProps {
  displayColor: string;
  /** 現在のグループ名（null = 独立タグ） */
  currentGroup?: string | null | undefined;
  /** グループ候補一覧 */
  groupOptions?: GroupOption[] | undefined;
  /** グループに属するタグか（色変更はグループ単位のため個別無効） */
  isGrouped?: boolean | undefined;

  // Handlers
  onOpenRenameDialog: () => void;
  onColorChange: (color: TagColorName) => void;
  onChangeGroup?: ((newGroup: string | null) => void) | undefined;
  onOpenMergeModal: () => void;
  onShowOnlyTag: () => void;
  onDeleteTag: (() => void) | undefined;
}

export function FilterItemMenu({
  displayColor,
  currentGroup,
  groupOptions,
  isGrouped,
  onOpenRenameDialog,
  onColorChange,
  onChangeGroup,
  onOpenMergeModal,
  onShowOnlyTag,
  onDeleteTag,
}: FilterItemMenuProps) {
  const t = useTranslations();

  return (
    <DropdownMenuContent align="start" side="right">
      {/* 名前を変更 */}
      <DropdownMenuItem onClick={onOpenRenameDialog}>
        <Pencil className="mr-2 size-4" />
        {t('calendar.filter.rename')}
      </DropdownMenuItem>

      {/* カラーを変更（グループ内タグは色がグループ統一のため非表示） */}
      {!isGrouped && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 size-4" />
            {t('calendar.filter.changeColor')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
            <ColorPaletteMenuItems selectedColor={displayColor} onColorSelect={onColorChange} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* グループを変更 */}
      {groupOptions && groupOptions.length > 0 && onChangeGroup && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderUp className="mr-2 size-4" />
            {t('calendar.filter.changeGroup')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={() => onChangeGroup(null)}
              className={!currentGroup ? 'bg-state-selected' : undefined}
            >
              {t('calendar.filter.noGroup')}
            </DropdownMenuItem>
            {groupOptions.map((group) => (
              <DropdownMenuItem
                key={group.name}
                onClick={() => onChangeGroup(group.name)}
                className={currentGroup === group.name ? 'bg-state-selected' : undefined}
              >
                <span
                  className={cn('mr-1 size-3 rounded-full', getTagColorClasses(group.color).dot)}
                  aria-hidden
                />
                {group.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* マージ */}
      <DropdownMenuItem onClick={onOpenMergeModal}>
        <Merge className="mr-2 size-4" />
        {t('calendar.filter.merge')}
      </DropdownMenuItem>

      {/* このタグだけ表示 */}
      <DropdownMenuItem onClick={onShowOnlyTag}>
        <Eye className="mr-2 size-4" />
        {t('calendar.filter.showOnlyThis')}
      </DropdownMenuItem>

      {/* 削除 */}
      {onDeleteTag && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onDeleteTag}>
            <Trash2 className="mr-2 size-4" />
            {t('common.actions.delete')}
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}

/** タグなし用のシンプルなメニュー */
export function UntaggedItemMenu({ onShowOnlyThis }: { onShowOnlyThis: () => void }) {
  const t = useTranslations();

  return (
    <DropdownMenuContent align="start" side="right">
      <DropdownMenuItem onClick={onShowOnlyThis}>
        <Eye className="mr-2 size-4" />
        {t('calendar.filter.showOnlyThis')}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
