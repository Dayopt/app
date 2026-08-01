'use client';

/**
 * タグ表示行（Pure props）
 *
 * カラードット + タグ名を表示し、クリックで TagQuickSelector を開く。
 * 右側に「…」メニュー（getTimeblockMenuItems で生成された項目）を配置。
 *
 * タグデータの解決とタグ作成は上位（TimeblockInspectorForm）が担当。
 * メニュー items は上位で `getTimeblockMenuItems` から生成して props 経由で受け取る。
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TagColorEntry } from '@/features/tags';
import { TagIcon, TagQuickSelector } from '@/features/tags';
import type { TimeblockMenuItem } from '@/features/timeblock/lib/timeblock-menu-items';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface TagRowProps {
  tagId: string | null;
  /** 解決済みのタグ名 */
  tagName: string;
  /** 解決済みのタグ色クラス（tagId が null なら undefined） */
  tagColorClasses?: TagColorEntry | undefined;
  /** 解決済みのタグアイコン名（tagId が null なら undefined） */
  tagIcon?: string | null | undefined;
  /** 解決済みのタグ色名（tagIcon表示に使用） */
  tagColor?: string | null | undefined;
  onTagChange: (tagId: string | null) => void;
  /** タグ作成コールバック（上位で useCreateTag を呼ぶ） */
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    parentId?: string | null,
  ) => void;
  /** メニュー項目（getTimeblockMenuItems で生成。空配列ならメニューボタンを出さない） */
  menuItems?: TimeblockMenuItem[] | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す。set されたら「…」の右に × を出す） */
  onCloseInspector?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/** Inspectorのタグ選択行（カラードット + タグ名、クリックでQuickSelector表示） */
export function TagRow({
  tagId: _tagId,
  tagName,
  tagColorClasses: colorClasses,
  tagIcon,
  tagColor,
  onTagChange,
  onCreateAndSelect,
  menuItems,
  onCloseInspector,
  disabled = false,
}: TagRowProps) {
  const t = useTranslations();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasMenuItems = !!menuItems && menuItems.length > 0;

  const handleSelect = useCallback(
    (selectedTagId: string) => {
      onTagChange(selectedTagId);
      setSelectorOpen(false);
    },
    [onTagChange],
  );

  const handleCreateAndSelect = useCallback(
    async (name: string, color?: string | null, icon?: string | null, parentId?: string | null) => {
      await onCreateAndSelect(name, color, icon, parentId);
      setSelectorOpen(false);
    },
    [onCreateAndSelect],
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setSelectorOpen(true)}
          disabled={disabled}
          className="hover:bg-state-hover -mt-1 -ml-2 flex min-w-0 items-center gap-2 rounded-lg py-1 pr-2 pl-2 text-lg font-medium transition-colors"
          aria-label={`${t('common.tags.change')}: ${tagName}`}
        >
          <TagIcon
            icon={tagIcon ?? null}
            color={tagColor ?? colorClasses?.cssVar}
            size="md"
            className="flex-shrink-0"
          />
          <span className="text-foreground truncate">{tagName}</span>
          <ChevronDown className="text-muted-foreground size-4 flex-shrink-0" aria-hidden />
        </button>

        {/* 右側: … メニュー + close button（Mobile Drawer のみ） */}
        <div className="-mr-2 flex items-center">
          {hasMenuItems && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  icon
                  size="lg"
                  disabled={disabled}
                  aria-label={t('common.actions.more')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menuItems.map((item, index) => {
                  const IconComponent = item.icon;
                  const showSeparator =
                    item.dangerous && index > 0 && !menuItems[index - 1]?.dangerous;
                  return (
                    <div key={item.key}>
                      {showSeparator && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onClick={item.onSelect}
                        variant={item.dangerous ? 'destructive' : 'default'}
                      >
                        <IconComponent className="mr-2 size-4" />
                        {t(item.labelKey)}
                      </DropdownMenuItem>
                    </div>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {onCloseInspector && (
            <Button
              type="button"
              variant="ghost"
              icon
              size="lg"
              onClick={onCloseInspector}
              aria-label={t('common.actions.close')}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </Button>
          )}
        </div>
      </div>

      <TagQuickSelector
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        onSelect={handleSelect}
        onCreateAndSelect={handleCreateAndSelect}
        anchorRef={buttonRef}
      />
    </>
  );
}
