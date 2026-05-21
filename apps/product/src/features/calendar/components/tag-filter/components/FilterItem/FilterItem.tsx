'use client';

import { useCallback, useState } from 'react';

import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';
import { useTags } from '@/features/tags';
import { useTagModalNavigation } from '../../../../hooks/useTagModalNavigation';

import { Checkbox } from '@/lib/components/ui/checkbox';
import { DropdownMenu, DropdownMenuTrigger } from '@/lib/components/ui/dropdown-menu';
import { HoverTooltip } from '@/lib/components/ui/tooltip';

import { FilterItemMenu, UntaggedItemMenu } from './FilterItemMenu';
import { useFilterItemEdit } from './useFilterItemEdit';

/** フィルターアイテムコンポーネントのプロパティ */
export interface FilterItemProps {
  label: string;
  tagId?: string;
  checkboxColor?: string | undefined;
  labelClassName?: string;
  icon?: React.ReactNode;
  checked: boolean;
  onCheckedChange: () => void;
  disabled?: boolean;
  disabledReason?: string;
  count?: number;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
  onDeleteTag?: (tagId: string) => void;
  onShowOnlyThis?: () => void;
}

/** カレンダーフィルターの単一タグ行コンポーネント（チェックボックス・色変更・メニュー付き） */
export function FilterItem({
  label,
  tagId,
  checkboxColor,
  labelClassName,
  icon,
  checked,
  onCheckedChange,
  disabled = false,
  disabledReason,
  count,
  dragHandleProps,
  onDeleteTag,
  onShowOnlyThis,
}: FilterItemProps) {
  const t = useTranslations();
  const { showOnlyTag } = useCalendarFilterStore();
  const { openTagMergeModal, openTagRenameModal } = useTagModalNavigation();
  const { data: existingTags } = useTags();

  // Menu open state
  const [menuOpen, setMenuOpen] = useState(false);

  // Edit hook (色・アイコン変更)
  const { displayColor, handleColorChange, handleIconChange } = useFilterItemEdit({
    tagId,
    initialColor: checkboxColor,
  });

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if ((!tagId && !onShowOnlyThis) || disabled) return;
      e.preventDefault();
      setMenuOpen(true);
    },
    [tagId, onShowOnlyThis, disabled],
  );

  // Checkbox color — inline style で border/bg を直接上書き（CSS変数上書きでは効かないため）
  const colorClasses = getTagColorClasses(displayColor);
  const checkboxColorStyle: React.CSSProperties = {
    borderColor: colorClasses.cssVar,
    backgroundColor: checked ? colorClasses.cssVar : undefined,
  };

  // 行クリックでチェック切り替え
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      // チェックボックス自体のクリックは除外（二重トリガー防止）
      if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
      if (disabled) return;
      onCheckedChange();
    },
    [disabled, onCheckedChange],
  );

  const handleRename = useCallback(() => {
    if (!tagId) return;
    const target = (existingTags ?? []).find((tag) => tag.id === tagId);
    openTagRenameModal({
      id: tagId,
      name: target?.name ?? label,
      parent_id: target?.parent_id ?? null,
    });
  }, [tagId, existingTags, label, openTagRenameModal]);

  return (
    <div
      className={cn(
        'group/item hover:bg-state-hover flex h-8 w-full min-w-0 items-center rounded-lg text-sm [@media(pointer:coarse)]:min-h-11',
        disabled && 'cursor-not-allowed opacity-50',
        dragHandleProps && 'cursor-grab active:cursor-grabbing',
        !dragHandleProps && !disabled && 'cursor-pointer',
        menuOpen && 'bg-state-selected',
      )}
      title={disabled ? disabledReason : undefined}
      onContextMenu={handleContextMenu}
      onClick={handleRowClick}
      {...(dragHandleProps || {})}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        className="ml-2 shrink-0 cursor-pointer"
        style={checkboxColorStyle}
      />
      {icon && <span className="text-muted-foreground ml-2 shrink-0">{icon}</span>}
      <HoverTooltip
        content={label}
        side="top"
        disabled={menuOpen}
        wrapperClassName="ml-1 min-w-0 flex-1"
      >
        <span className={cn('min-w-0 truncate', labelClassName)}>{label}</span>
      </HoverTooltip>

      {/* Menu trigger */}
      {(tagId || onShowOnlyThis) && !disabled && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('calendar.filter.tagMenu')}
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element touch target
              className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 before:absolute before:-inset-3 before:content-[''] [@media(hover:none)]:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          {tagId ? (
            <FilterItemMenu
              displayColor={displayColor}
              onOpenRenameDialog={handleRename}
              onColorChange={handleColorChange}
              onIconChange={handleIconChange}
              onOpenMergeModal={() =>
                openTagMergeModal({ id: tagId, name: label, color: checkboxColor ?? null })
              }
              onShowOnlyTag={() => showOnlyTag(tagId)}
              onDeleteTag={onDeleteTag ? () => onDeleteTag(tagId) : undefined}
            />
          ) : onShowOnlyThis ? (
            <UntaggedItemMenu onShowOnlyThis={onShowOnlyThis} />
          ) : null}
        </DropdownMenu>
      )}

      {/* Count */}
      {count !== undefined && (
        <span className="text-muted-foreground ml-1 shrink-0 pr-2 text-xs tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}
