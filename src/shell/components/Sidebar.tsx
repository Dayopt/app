'use client';

import { PanelLeft, Search } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { HoverTooltip } from '@/components/ui/tooltip';
import { useGlobalSearch } from '@/hooks/use-global-search';
import { getAvatarUrl, getDisplayName } from '@/lib/user';
import { useAuthStore } from '@/stores/useAuthStore';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useTranslations } from 'next-intl';

import { UserMenu } from './UserMenu';

interface SidebarProps {
  /** Sidebarのコンテンツ（composition layerから注入） */
  children: ReactNode;
  /** フッターに配置するアクション（通知アイコン等） */
  footerActions?: ReactNode;
  /** ランドマークのアクセシブルネーム */
  'aria-label'?: string;
}

/**
 * サイドバーコンテナ
 *
 * ヘッダー: Dayoptロゴ + 閉じるボタン
 * コンテンツ: composition layerから注入
 * フッター: UserMenu + アクション
 */
export function Sidebar({ children, footerActions, 'aria-label': ariaLabel }: SidebarProps) {
  const user = useAuthStore((state) => state.user);
  const closeSidebar = useLayoutStore.use.closeSidebar();
  const { open: openSearch } = useGlobalSearch();
  const t = useTranslations();

  const userData = {
    name: getDisplayName(user, 'User'),
    email: user?.email || '',
    avatar: getAvatarUrl(user),
  };

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
            alt="Dayopt"
            width={20}
            height={20}
            className="rounded"
          />
          <span className="text-foreground text-sm font-semibold tracking-tight">Dayopt</span>
        </div>
        <div className="flex items-center">
          <HoverTooltip content={t('navigation.sidebar.navigation.search')} side="bottom">
            <Button
              variant="ghost"
              icon
              className="size-8"
              onClick={() => openSearch()}
              aria-label={t('navigation.sidebar.navigation.search')}
            >
              <Search className="size-4" />
            </Button>
          </HoverTooltip>
          <HoverTooltip content={t('navigation.sidebar.closeSidebar')} side="bottom">
            <Button
              variant="ghost"
              icon
              className="size-8"
              onClick={closeSidebar}
              aria-label={t('navigation.sidebar.closeSidebar')}
            >
              <PanelLeft className="size-4" />
            </Button>
          </HoverTooltip>
        </div>
      </div>

      {/* Content */}
      <div className="scrollbar-stable flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {children}
      </div>

      {/* Footer - UserMenu + Actions */}
      <div className="shrink-0 px-2 py-2">
        <div className="flex items-center justify-between">
          <UserMenu user={userData} />
          <div className="flex items-center">{footerActions}</div>
        </div>
      </div>
    </aside>
  );
}
