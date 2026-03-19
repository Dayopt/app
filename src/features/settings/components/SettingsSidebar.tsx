'use client';

import { usePathname } from 'next/navigation';

import { Link } from '@/platform/i18n/navigation';

import { useTranslations } from 'next-intl';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/useSettingsStore';

import { SETTINGS_CATEGORIES } from '../constants';

import type { SettingsCategory } from '../types';

interface SettingsSidebarProps {
  className?: string;
}

/**
 * 設定サイドバー
 *
 * PC（Dialog内）: store でカテゴリ切替（URL変更なし）
 * Mobile（実ページ）: Link でページ遷移
 */
export function SettingsSidebar({ className }: SettingsSidebarProps) {
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const pathname = usePathname() ?? '/';

  // PC: store から、Mobile: pathname から現在カテゴリを取得
  const storeCategory = useSettingsStore((s) => s.category);
  const setCategory = useSettingsStore((s) => s.setCategory);
  const pathCategory = pathname.split('/settings/')[1]?.split('/')[0] ?? 'profile';
  const currentCategory = isMobile ? pathCategory : storeCategory;

  return (
    <aside className={cn('bg-surface-container flex flex-col', className)}>
      <div className="flex h-12 items-center px-6 pt-4">
        <h2 className="text-lg font-bold">{t('settings.dialog.title')}</h2>
      </div>
      <ScrollArea className="flex-1">
        <nav className="flex flex-col gap-1 p-2">
          {SETTINGS_CATEGORIES.map((category) => {
            const Icon = category.icon;
            const isActive = currentCategory === category.id;

            if (isMobile) {
              return (
                <Link
                  key={category.id}
                  href={`/settings/${category.id}`}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-lg px-4 py-2 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-state-selected text-foreground'
                      : 'text-muted-foreground hover:bg-state-hover',
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="font-normal">{t(category.labelKey)}</span>
                </Link>
              );
            }

            return (
              <button
                key={category.id}
                type="button"
                onClick={() => setCategory(category.id as SettingsCategory)}
                className={cn(
                  'flex w-full items-center gap-4 rounded-lg px-4 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'bg-state-selected text-foreground'
                    : 'text-muted-foreground hover:bg-state-hover',
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="font-normal">{t(category.labelKey)}</span>
              </button>
            );
          })}
        </nav>
      </ScrollArea>
    </aside>
  );
}
