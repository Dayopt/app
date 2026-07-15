'use client';

import { PanelLeft, Search } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { APP_NAME } from '@/lib/app-info';
import { useShellStore } from '@/lib/stores/useShellStore';
import { Button, HoverTooltip } from '@dayopt/components';
import { useTranslations } from 'next-intl';

import { UserMenu } from './UserMenu';

interface SidebarProps {
  /** Sidebarのコンテンツ（composition layerから注入） */
  children: ReactNode;
  /** UserMenu に表示するユーザー情報（composition layerから注入） */
  user: { name: string; email: string; avatar: string | null };
  /** フッターに配置するアクション（通知アイコン等） */
  footerActions?: ReactNode;
  /** ランドマークのアクセシブルネーム */
  'aria-label'?: string;
}

/** サイドバーコンテナ（ヘッダー + スクロール領域 + フッター） */
export function Sidebar({ children, user, footerActions, 'aria-label': ariaLabel }: SidebarProps) {
  const closeSidebar = useShellStore.use.closeSidebar();
  const openTimeblockSearch = useShellStore.use.openTimeblockSearch();
  const t = useTranslations();

  return (
    <aside
      className="border-border bg-surface-container text-foreground flex h-full w-full flex-col border-r"
      aria-label={ariaLabel}
    >
      {/* Header - Logo + Close */}
      <div className="flex h-12 shrink-0 items-center justify-between px-2">
        <div className="flex items-center gap-2 pl-2">
          <Image
            src="/icons/icon-192.png"
            alt={APP_NAME}
            width={20}
            height={20}
            priority
            className="rounded-lg"
          />
          <span className="text-foreground text-sm font-medium tracking-tight">{APP_NAME}</span>
        </div>
        <div className="flex items-center">
          <HoverTooltip content={t('calendar.search.open')} side="bottom">
            <Button
              variant="ghost"
              icon
              size="sm"
              onClick={openTimeblockSearch}
              aria-label={t('calendar.search.open')}
            >
              <Search className="size-4" />
            </Button>
          </HoverTooltip>
          <HoverTooltip content={t('navigation.sidebar.closeSidebar')} side="bottom">
            <Button
              variant="ghost"
              icon
              size="sm"
              onClick={closeSidebar}
              aria-label={t('navigation.sidebar.closeSidebar')}
            >
              <PanelLeft className="size-4" />
            </Button>
          </HoverTooltip>
        </div>
      </div>

      {/* Content */}
      {/* scrollbar-stable: drag 中に collapsed groups の children container が
          展開されて scrollbar が現れる際、内容が左右にずれるのを防ぐ */}
      <div className="scrollbar-stable flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto">
        {children}
      </div>

      {/* Footer - UserMenu + Actions */}
      <div className="shrink-0 px-2 py-2">
        <div className="flex items-center justify-between">
          <UserMenu user={user} />
          <div className="flex items-center">{footerActions}</div>
        </div>
      </div>
    </aside>
  );
}
