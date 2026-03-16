'use client';

import { useCallback, useRef, useState } from 'react';

import {
  ChevronRight,
  Eye,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Checkbox } from '@/components/ui/checkbox';
import { ColorPaletteMenuItems } from '@/components/ui/color-palette-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TagColorName } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

interface GroupHeaderProps {
  label: string;
  checked: boolean;
  indeterminate: boolean;
  collapsed: boolean;
  displayColor: string;
  onCheckedChange: () => void;
  onToggleCollapse: () => void;
  onShowOnlyGroup: () => void;
  onColorChange: (color: TagColorName) => void;
  onAddTagToGroup?: (() => void) | undefined;
  onRenameGroup?: (() => void) | undefined;
  onUngroupTags?: (() => void) | undefined;
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
  onCheckedChange,
  onToggleCollapse,
  onShowOnlyGroup,
  onColorChange,
  onAddTagToGroup,
  onRenameGroup,
  onUngroupTags,
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
        'group/item hover:bg-state-hover flex h-8 w-full min-w-0 cursor-pointer items-center rounded text-sm font-medium',
        menuOpen && 'bg-state-selected',
      )}
      onClick={handleRowClick}
      onContextMenu={handleContextMenu}
    >
      <Checkbox
        checked={indeterminate ? 'indeterminate' : checked}
        onCheckedChange={onCheckedChange}
        className="ml-2 shrink-0 cursor-pointer"
        style={{
          borderColor: displayColor,
          backgroundColor: checked || indeterminate ? displayColor : 'transparent',
        }}
      />
      <span className="ml-1 min-w-0 truncate">{label}</span>
      <ChevronRight
        className={cn(
          'text-muted-foreground ml-1 size-4 shrink-0 transition-transform',
          !collapsed && 'rotate-90',
        )}
      />

      <div className="flex-1" />

      {/* Menu */}
      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t('calendar.filter.tagMenu')}
            className="text-muted-foreground hover:text-foreground hover:bg-state-hover relative flex size-6 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/item:opacity-100 before:absolute before:-inset-2 before:content-['']"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
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
              <ColorPaletteMenuItems selectedColor={displayColor} onColorSelect={onColorChange} />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
          {onDeleteGroup && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDeleteGroup}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                {t('calendar.filter.deleteGroup.label')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
