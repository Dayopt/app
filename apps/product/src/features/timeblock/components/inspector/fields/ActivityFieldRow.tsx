'use client';

/**
 * アクティビティ表示行（Pure props）
 *
 * アイコン + アクティビティ名を表示し、クリックで ActivityQuickSelector を開く。
 * 右側に「…」メニュー（getTimeblockMenuItems で生成された項目）を配置。
 *
 * アクティビティデータの解決と作成は上位（TimeblockInspectorForm）が担当。
 * メニュー items は上位で `getTimeblockMenuItems` から生成して props 経由で受け取る。
 *
 * 色・アイコンを持つのはカテゴリーだけで、アクティビティはこれを継承する（#2162 §4-6）。
 * 未分類（継承元カテゴリーが無い）と「アクティビティなし」はどちらも中立表示になるが
 * 別概念なので、`activityId === null` を「アクティビティなし」の判定に使う。
 */

import { useCallback, useRef, useState } from 'react';

import { ChevronDown, MoreHorizontal, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ActivityIcon, ActivityQuickSelector } from '@/features/activities';
import type { TimeblockMenuItem } from '@/features/timeblock/lib/timeblock-menu-items';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@dayopt/components';

interface ActivityFieldRowProps {
  activityId: string | null;
  /** 解決済みのアクティビティ名 */
  activityName: string;
  /** 解決済みの継承アイコン名（未分類・未設定なら null） */
  activityIcon?: string | null | undefined;
  /** 解決済みの継承色名（未分類・未設定なら null） */
  activityColor?: string | null | undefined;
  /**
   * アクティビティがカテゴリーに所属していない（= 継承する色が無い）。
   *
   * color の null 判定では「カテゴリーはあるが color 未設定」と区別できないため、
   * 呼び出し元が categoryId の実在から明示的に渡す（ActivityIcon の neutral 契約）。
   */
  uncategorized?: boolean | undefined;
  onActivityChange: (activityId: string | null) => void;
  /** アクティビティ作成コールバック（上位で useCreateActivity を呼ぶ） */
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    categoryId?: string | null,
  ) => void;
  /** メニュー項目（getTimeblockMenuItems で生成。空配列ならメニューボタンを出さない） */
  menuItems?: TimeblockMenuItem[] | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す。set されたら「…」の右に × を出す） */
  onCloseInspector?: (() => void) | undefined;
  disabled?: boolean | undefined;
}

/** Inspector のアクティビティ選択行（アイコン + 名前、クリックで QuickSelector 表示） */
export function ActivityFieldRow({
  activityId,
  activityName,
  activityIcon,
  activityColor,
  uncategorized = false,
  onActivityChange,
  onCreateAndSelect,
  menuItems,
  onCloseInspector,
  disabled = false,
}: ActivityFieldRowProps) {
  const t = useTranslations();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const hasMenuItems = !!menuItems && menuItems.length > 0;

  const handleSelect = useCallback(
    (selectedActivityId: string) => {
      onActivityChange(selectedActivityId);
      setSelectorOpen(false);
    },
    [onActivityChange],
  );

  const handleCreateAndSelect = useCallback(
    async (
      name: string,
      color?: string | null,
      icon?: string | null,
      categoryId?: string | null,
    ) => {
      await onCreateAndSelect(name, color, icon, categoryId);
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
          aria-label={`${t('calendar.filter.changeActivity')}: ${activityName}`}
        >
          <ActivityIcon
            icon={activityIcon ?? null}
            color={activityColor ?? null}
            size="md"
            className="flex-shrink-0"
            neutral={activityId === null || uncategorized}
          />
          <span className="text-foreground truncate">{activityName}</span>
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

      <ActivityQuickSelector
        open={selectorOpen}
        onOpenChange={setSelectorOpen}
        onSelect={handleSelect}
        onCreateAndSelect={handleCreateAndSelect}
        anchorRef={buttonRef}
      />
    </>
  );
}
