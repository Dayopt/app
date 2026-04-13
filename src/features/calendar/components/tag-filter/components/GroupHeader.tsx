'use client';

import { useCallback, useRef, useState } from 'react';

import {
  BarChart3,
  ChevronRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Smile,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { IconPicker, TagIcon } from '@/features/tags';
import { ColorPaletteMenuItems } from '@/lib/components/ui/color-palette-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/lib/components/ui/dropdown-menu';
import type { TagColorName } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface GroupHeaderProps {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  collapsed: boolean;
  displayColor: string;
  /** モバイル時: メニュー項目を簡略化（このグループだけ表示のみ） */
  isMobile?: boolean;
  onCheckedChange: () => void;
  onToggleCollapse: () => void;
  onShowOnlyGroup: () => void;
  onColorChange: (color: TagColorName) => void;
  onIconChange?: ((icon: string | null) => void) | undefined;
  currentIcon?: string | null | undefined;
  onAddTagToGroup?: (() => void) | undefined;
  onRenameGroup?: (() => void) | undefined;
  onUngroupTags?: (() => void) | undefined;
  onViewStats?: (() => void) | undefined;
  onDeleteGroup?: (() => void) | undefined;
}

/**
 * コロン記法グループのヘッダー行
 *
 * シェブロン（展開/折りたたみ） + チェックボックス + プレフィックス名 + メニュー
 */
export function GroupHeader({
  label,
  checked,
  indeterminate,
  collapsed,
  displayColor,
  isMobile,
  onCheckedChange,
  onToggleCollapse,
  onShowOnlyGroup,
  onColorChange,
  onIconChange,
  currentIcon,
  onAddTagToGroup,
  onRenameGroup,
  onUngroupTags,
  onViewStats,
  onDeleteGroup,
}: GroupHeaderProps) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuClosedAtRef = useRef(0);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) menuClosedAtRef.current = Date.now();
  }, []);

  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
      if ((e.target as HTMLElement).closest('button')) return;
      if (menuOpen) return;
      if (Date.now() - menuClosedAtRef.current < 200) return;
      onToggleCollapse();
    },
    [onToggleCollapse, menuOpen],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onShowOnlyGroup();
    },
    [onShowOnlyGroup],
  );

  return (
    <div
      className={cn(
        'group/item hover:bg-state-hover flex w-full min-w-0 cursor-pointer items-center rounded-lg text-sm',
        isMobile ? 'h-11' : 'h-8',
        menuOpen && 'bg-state-selected',
        !checked && !indeterminate && 'opacity-50',
      )}
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
    >
      {/* グループアイコン */}
      <span className="ml-2 shrink-0">
        <TagIcon icon={currentIcon ?? null} color={displayColor} size="sm" />
      </span>
      <span className="ml-2 min-w-0 truncate">{label}</span>
      <ChevronRight
        className={cn(
          'text-muted-foreground ml-1 size-4 shrink-0 transition-transform',
          !collapsed && 'rotate-90',
        )}
      />

      <div className="flex-1" />

      {/* 👁 フィルタートグル */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onCheckedChange();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          "text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-['']",
          checked || indeterminate ? 'opacity-0 group-hover/item:opacity-100' : 'opacity-100',
          isMobile && 'opacity-100',
        )}
        aria-label={
          checked || indeterminate ? t('calendar.filter.hide') : t('calendar.filter.show')
        }
      >
        {checked || indeterminate ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </button>

      <div className="w-1 shrink-0" />

      {/* Menu */}
      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('calendar.filter.tagMenu')}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element touch target
            className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 before:absolute before:-inset-2.5 before:content-[''] [@media(hover:none)]:opacity-100"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          {isMobile ? (
            <DropdownMenuItem onClick={onShowOnlyGroup}>
              <Eye className="mr-2 size-4" />
              {t('calendar.filter.showOnlyThis')}
            </DropdownMenuItem>
          ) : (
            <>
              {onAddTagToGroup && (
                <DropdownMenuItem onClick={onAddTagToGroup}>
                  <Plus className="mr-2 size-4" />
                  {t('calendar.filter.addTagToGroup')}
                </DropdownMenuItem>
              )}
              {onRenameGroup && (
                <DropdownMenuItem onClick={onRenameGroup}>
                  <Pencil className="mr-2 size-4" />
                  {t('calendar.filter.rename')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Palette className="mr-2 size-4" />
                  {t('calendar.filter.changeColor')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
                  <ColorPaletteMenuItems
                    selectedColor={displayColor}
                    onColorSelect={onColorChange}
                  />
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
                    <IconPicker
                      value={currentIcon ?? null}
                      onChange={onIconChange}
                      color={displayColor}
                    />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {/* --- アクション --- */}
              <DropdownMenuSeparator />

              {onUngroupTags && (
                <DropdownMenuItem onClick={onUngroupTags}>
                  <Unlink className="mr-2 size-4" />
                  {t('calendar.filter.ungroupTags')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onShowOnlyGroup}>
                <Eye className="mr-2 size-4" />
                {t('calendar.filter.showOnlyThis')}
              </DropdownMenuItem>
              {onViewStats && (
                <DropdownMenuItem onClick={onViewStats}>
                  <BarChart3 className="mr-2 size-4" />
                  {t('calendar.filter.viewStats')}
                </DropdownMenuItem>
              )}

              {/* --- 破壊的操作 --- */}
              {onDeleteGroup && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDeleteGroup} variant="destructive">
                    <Trash2 className="mr-2 size-4" />
                    {t('calendar.filter.deleteGroup.label')}
                  </DropdownMenuItem>
                </>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
