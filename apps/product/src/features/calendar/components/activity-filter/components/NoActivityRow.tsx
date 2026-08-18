'use client';

import { useState } from 'react';

import { Eye, EyeOff, MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon } from '@/features/tags';
import { cn, DropdownMenu, DropdownMenuTrigger } from '@dayopt/components';

import { NoActivityRowMenu } from './ActivityRowMenu';

interface NoActivityRowProps {
  checked: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onShowOnlyThis: () => void;
}

/**
 * 「アクティビティなし」行 — アクティビティが設定されていないブロックの表示切替。
 *
 * サイドバー見出しの「未分類」（= カテゴリー未所属のアクティビティ）とは別物なので、
 * 語彙を混ぜないこと。こちらはブロック側の状態を指す。
 */
export function NoActivityRow({ checked, isMobile, onToggle, onShowOnlyThis }: NoActivityRowProps) {
  const t = useTranslations();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div role="listitem">
      <div
        className={cn(
          'group/item hover:bg-state-hover flex cursor-pointer items-center rounded-lg text-sm',
          isMobile ? 'h-11' : 'h-8',
          menuOpen && 'bg-state-selected',
        )}
        onClick={onToggle}
      >
        <span className="ml-2 shrink-0">
          <TagIcon icon={null} color={null} size="sm" isUncategorized />
        </span>

        <span className={cn('ml-2 min-w-0 flex-1 truncate', !checked && 'text-muted-foreground')}>
          {t('calendar.filter.noActivity')}
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggle();
          }}
          aria-label={checked ? t('calendar.filter.hide') : t('calendar.filter.show')}
          className={cn(
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素のヒットエリア拡張に before:content-[''] の空文字指定が必須
            "text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative flex size-6 shrink-0 items-center justify-center rounded-lg transition-opacity before:absolute before:-inset-2 before:content-[''] focus-visible:ring-2 focus-visible:outline-none",
            checked
              ? 'opacity-0 group-focus-within/item:opacity-100 group-hover/item:opacity-100 focus-visible:opacity-100'
              : 'opacity-100',
            isMobile && 'opacity-100',
          )}
        >
          {checked ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </button>

        <div className="w-1 shrink-0" />

        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('calendar.filter.activityMenu')}
              // eslint-disable-next-line tailwindcss/no-arbitrary-value -- 擬似要素の 44px ヒットエリアに空 content が必要
              className="text-muted-foreground hover:text-foreground hover:bg-state-hover focus-visible:ring-ring relative mr-1 flex size-6 shrink-0 items-center justify-center rounded-lg opacity-0 transition-opacity group-focus-within/item:opacity-100 group-hover/item:opacity-100 after:absolute after:inset-0 after:m-auto after:size-11 after:content-[''] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none [@media(hover:none)]:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <NoActivityRowMenu onShowOnlyThis={onShowOnlyThis} />
        </DropdownMenu>
      </div>
    </div>
  );
}
