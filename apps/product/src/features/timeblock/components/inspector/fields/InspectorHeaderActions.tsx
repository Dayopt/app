'use client';

/**
 * Inspector パネル最上部の utility 行（Pure props）
 *
 * 「…」メニュー（getTimeblockMenuItems で生成された項目）+ 閉じるボタンを配置する。
 * アクティビティ選択（ActivityFieldRow）が時間フィールド直下へ移動した後も、
 * この行はパネル最上部に独立して常時表示する（#2298）。
 *
 * メニュー items は上位（TimeblockInspectorForm）で `getTimeblockMenuItems` から
 * 生成して props 経由で受け取る。
 */

import { MoreHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { TimeblockMenuItem } from '@/features/timeblock/lib/timeblock-menu-items';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface InspectorHeaderActionsProps {
  /** メニュー項目（getTimeblockMenuItems で生成。空配列ならメニューボタンを出さない） */
  menuItems?: TimeblockMenuItem[] | undefined;
  /** Inspector を閉じるコールバック。set されたら「…」の右に × を出す */
  onCloseInspector?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/** Inspector パネル最上部の「…」メニュー + 閉じるボタン */
export function InspectorHeaderActions({
  menuItems,
  onCloseInspector,
  disabled = false,
}: InspectorHeaderActionsProps) {
  const t = useTranslations();
  const hasMenuItems = !!menuItems && menuItems.length > 0;

  if (!hasMenuItems && !onCloseInspector) return null;

  return (
    <div className="-mr-2 flex items-center justify-end">
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
              const showSeparator = item.dangerous && index > 0 && !menuItems[index - 1]?.dangerous;
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
  );
}
