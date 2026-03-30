'use client';

import { BarChart3, Eye, FolderUp, Merge, Palette, Pencil, Smile, Trash2 } from 'lucide-react';
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
import { IconPicker, TagIcon } from '@/features/tags';
import type { TagColorName } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

/** タグのグループ情報 */
export interface GroupOption {
  name: string;
  color: string | null;
  icon?: string | null;
}

interface FilterItemMenuProps {
  displayColor: string;
  /** 現在のアイコン名 */
  currentIcon?: string | null | undefined;
  /** 現在のグループ名（null = 独立タグ） */
  currentGroup?: string | null | undefined;
  /** グループ候補一覧 */
  groupOptions?: GroupOption[] | undefined;
  /** グループに属するタグか（色変更はグループ単位のため個別無効） */
  isGrouped?: boolean | undefined;
  /** モバイル時: メニュー項目を簡略化（このタグだけ表示 + 削除のみ） */
  isMobile?: boolean | undefined;

  // Handlers
  onOpenRenameDialog: () => void;
  onColorChange: (color: TagColorName) => void;
  onIconChange?: ((icon: string | null) => void) | undefined;
  onChangeGroup?: ((newGroup: string | null) => void) | undefined;
  onOpenMergeModal: () => void;
  onShowOnlyTag: () => void;
  onViewStats?: (() => void) | undefined;
  onDeleteTag: (() => void) | undefined;
}

/** フィルターアイテムのドロップダウンメニュー（タグ操作: 名前変更・色変更・グループ移動・削除等） */
export function FilterItemMenu({
  displayColor,
  currentIcon,
  currentGroup,
  groupOptions,
  isGrouped,
  isMobile,
  onOpenRenameDialog,
  onColorChange,
  onIconChange,
  onChangeGroup,
  onOpenMergeModal,
  onShowOnlyTag,
  onViewStats,
  onDeleteTag,
}: FilterItemMenuProps) {
  const t = useTranslations();

  // モバイル: 「このタグだけ表示」+「削除」のみ。管理系は設定画面へ委譲
  if (isMobile) {
    return (
      <DropdownMenuContent align="start" side="right">
        <DropdownMenuItem onClick={onShowOnlyTag}>
          <Eye className="mr-2 size-4" />
          {t('calendar.filter.showOnlyThis')}
        </DropdownMenuItem>
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

      {/* アイコンを変更 */}
      {onIconChange && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Smile className="mr-2 size-4" />
            {t('calendar.filter.changeIcon')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            className="max-h-80 w-72 overflow-y-auto p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <IconPicker value={currentIcon ?? null} onChange={onIconChange} color={displayColor} />
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
                className={cn(currentGroup === group.name ? 'bg-state-selected' : undefined)}
              >
                <TagIcon
                  icon={group.icon}
                  color={group.color}
                  size="sm"
                  className="mr-1 shrink-0"
                />
                {group.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* --- アクション --- */}
      <DropdownMenuSeparator />

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

      {/* 統計を見る */}
      {onViewStats && (
        <DropdownMenuItem onClick={onViewStats}>
          <BarChart3 className="mr-2 size-4" />
          {t('calendar.filter.viewStats')}
        </DropdownMenuItem>
      )}

      {/* --- 破壊的操作 --- */}
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

/** タグなしエントリ用のシンプルなフィルターメニュー */
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
