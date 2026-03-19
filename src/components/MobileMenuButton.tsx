'use client';

import { Menu } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useTranslations } from 'next-intl';

/**
 * モバイル用ハンバーガーメニューボタン
 *
 * 各ページのヘッダー/ツールバーに配置してSidebarを開閉する
 *
 * @example
 * ```tsx
 * // Calendar Toolbar
 * <div className="flex items-center gap-2">
 *   <MobileMenuButton className="md:hidden" />
 *   <h1>カレンダー</h1>
 * </div>
 * ```
 */
export function MobileMenuButton({ className }: { className?: string }) {
  const toggle = useLayoutStore((state) => state.toggleSidebar);
  const t = useTranslations();

  return (
    <Button
      variant="ghost"
      icon
      onClick={toggle}
      aria-label={t('common.aria.openMenu')}
      className={className}
    >
      <Menu className="size-6" />
    </Button>
  );
}
