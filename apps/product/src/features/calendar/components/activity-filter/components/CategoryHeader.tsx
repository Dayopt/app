'use client';

import { useCallback, useRef, useState } from 'react';

import {
  Archive,
  BarChart3,
  ChevronRight,
  Eye,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Smile,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { CategoryColorName } from '@/features/activities';
import { ActivityIcon, CategoryColorMenuItems, CategoryIconMenuItems } from '@/features/activities';
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

interface CategoryHeaderProps {
  label: string;
  /** 所属アクティビティの表示状態。none なら見出しを muted 表示にする */
  visibility: 'all' | 'none' | 'some';
  collapsed: boolean;
  displayColor: string;
  currentIcon?: string | null | undefined;
  /** モバイル時: メニュー項目を簡略化（このカテゴリーだけ表示 + アーカイブのみ） */
  isMobile?: boolean;
  onToggleCollapse: () => void;
  onShowOnlyCategory: () => void;
  onColorChange: (color: CategoryColorName) => void;
  onIconChange?: ((icon: string | null) => void) | undefined;
  onAddActivityToCategory?: (() => void) | undefined;
  onRenameCategory?: (() => void) | undefined;
  onViewStats?: (() => void) | undefined;
  onArchiveCategory?: (() => void) | undefined;
  onDeleteCategory?: (() => void) | undefined;
}

/**
 * カテゴリーの見出し行。
 *
 * 色ドット / アイコン + カテゴリー名 + 折りたたみシェブロン + メニュー。
 * **チェックボックスは置かない**（確定仕様）。所属アクティビティの一括表示は
 * メニューの「このカテゴリーだけ表示」で行う。色とアイコンはカテゴリーだけが持ち、
 * 所属アクティビティはこれを継承する。
 */
export function CategoryHeader({
  label,
  visibility,
  collapsed,
  displayColor,
  currentIcon,
  isMobile,
  onToggleCollapse,
  onShowOnlyCategory,
  onColorChange,
  onIconChange,
  onAddActivityToCategory,
  onRenameCategory,
  onViewStats,
  onArchiveCategory,
  onDeleteCategory,
}: CategoryHeaderProps) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuClosedAtRef = useRef(0);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) menuClosedAtRef.current = Date.now();
  }, []);

  // 行クリックは折りたたみ。メニュー直後の誤爆はガードする
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
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
      onShowOnlyCategory();
    },
    [onShowOnlyCategory],
  );

  return (
    <div
      className={cn(
        'group/item hover:bg-state-hover flex w-full min-w-0 cursor-pointer items-center rounded-lg text-sm',
        isMobile ? 'h-11' : 'h-8',
        menuOpen && 'bg-state-selected',
      )}
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
    >
      <span className="ml-2 shrink-0">
        <ActivityIcon icon={currentIcon ?? null} color={displayColor} size="sm" />
      </span>
      <span
        className={cn(
          'ml-2 min-w-0 truncate font-medium',
          visibility === 'none' ? 'text-muted-foreground' : 'text-foreground',
        )}
      >
        {label}
      </span>

      {/* シェブロン: 行クリックへ波及させず折りたたみのみを担当する独立ボタン */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        aria-label={
          collapsed ? t('calendar.filter.expandCategory') : t('calendar.filter.collapseCategory')
        }
        aria-expanded={!collapsed}
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
        className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative ml-1 flex size-6 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 before:absolute before:-inset-2 before:content-['']"
      >
        <ChevronRight className={cn('size-4 transition-transform', !collapsed && 'rotate-90')} />
      </button>

      <div className="flex-1" />

      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('calendar.filter.categoryMenu')}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
            className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative mr-1 flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          {isMobile ? (
            <>
              <DropdownMenuItem onClick={onShowOnlyCategory}>
                <Eye className="mr-2 size-4" />
                {t('calendar.filter.showOnlyThisCategory')}
              </DropdownMenuItem>
              {onArchiveCategory && (
                <DropdownMenuItem onClick={onArchiveCategory}>
                  <Archive className="mr-2 size-4" />
                  {t('calendar.filter.archive')}
                </DropdownMenuItem>
              )}
            </>
          ) : (
            <>
              {onAddActivityToCategory && (
                <DropdownMenuItem onClick={onAddActivityToCategory}>
                  <Plus className="mr-2 size-4" />
                  {t('calendar.filter.addActivityToCategory')}
                </DropdownMenuItem>
              )}
              {onRenameCategory && (
                <DropdownMenuItem onClick={onRenameCategory}>
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
                  <CategoryColorMenuItems
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
                  <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto p-2">
                    <CategoryIconMenuItems value={currentIcon ?? null} onChange={onIconChange} />
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={onShowOnlyCategory}>
                <Eye className="mr-2 size-4" />
                {t('calendar.filter.showOnlyThisCategory')}
              </DropdownMenuItem>
              {onViewStats && (
                <DropdownMenuItem onClick={onViewStats}>
                  <BarChart3 className="mr-2 size-4" />
                  {t('calendar.filter.viewStats')}
                </DropdownMenuItem>
              )}

              {/* アーカイブ（所属アクティビティも道連れ。可逆なので確認なし） */}
              {onArchiveCategory && (
                <DropdownMenuItem onClick={onArchiveCategory}>
                  <Archive className="mr-2 size-4" />
                  {t('calendar.filter.archive')}
                </DropdownMenuItem>
              )}

              {onDeleteCategory && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDeleteCategory} variant="destructive">
                    <Trash2 className="mr-2 size-4" />
                    {t('common.actions.delete')}
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
