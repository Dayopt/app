'use client';

import {
  BarChart3,
  Check,
  Eye,
  FolderUp,
  Merge,
  Palette,
  Pencil,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconPickerDropdownItems, TagIcon } from '@/features/tags';
import { ColorPaletteMenuItems } from '@/lib/components/ui/color-palette-picker';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/lib/components/ui/dropdown-menu';
import type { TagColorName } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

/** タグのグループ情報 */
export interface GroupOption {
  id: string;
  name: string;
  color: string | null;
  icon?: string | null;
}

interface FilterItemMenuProps {
  displayColor: string;
  /** 現在のアイコン名 */
  currentIcon?: string | null | undefined;
  /** 現在の親タグID（null = ルートタグ） */
  currentGroup?: string | null | undefined;
  /** 対象タグ自身のID。親候補リストから自身を除外するために使う */
  currentTagId?: string | undefined;
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
  onChangeGroup?: ((newGroupId: string | null) => void) | undefined;
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
  currentTagId,
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

  // 自分自身を親候補から除外
  const parentOptions = (groupOptions ?? []).filter((group) => group.id !== currentTagId);

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
          <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto p-2">
            <IconPickerDropdownItems value={currentIcon ?? null} onChange={onIconChange} />
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      )}

      {/* グループを変更 */}
      {groupOptions && onChangeGroup && (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <FolderUp className="mr-2 size-4" />
            {t('calendar.filter.changeGroup')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {/* グループなし */}
            <DropdownMenuItem
              onClick={() => onChangeGroup(null)}
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
                      onClick={() => onChangeGroup(group.id)}
                      className={cn(isCurrent ? 'bg-state-selected' : undefined)}
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
