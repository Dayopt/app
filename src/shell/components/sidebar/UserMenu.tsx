'use client';

import {
  Book,
  Building,
  ChevronDown,
  ExternalLink,
  FileText,
  HelpCircle,
  LogOut,
  Megaphone,
  MessageSquare,
  Palette,
  Settings,
  Shield,
  Sparkles,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useRouter } from '@/lib/i18n/navigation';
import { getInitials } from '@/lib/user';
import { useLogout } from '@/shell/hooks/useLogout';
import { useShellStore } from '@/shell/stores/useShellStore';
import { useLocale, useTranslations } from 'next-intl';

import type { SettingsCategory } from '@/types/settings';

/** ユーザーメニュー（アバター + ドロップダウン）。設定・ヘルプ・ログアウトへのアクセスを提供する。 */
export function UserMenu({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar?: string | null;
  };
}) {
  const router = useRouter();
  const { logout, isLoggingOut } = useLogout();
  const t = useTranslations();
  const locale = useLocale();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const openSettings = useShellStore((s) => s.openSettings);
  const openSheet = useShellStore((s) => s.openSheet);

  const handleOpenSettings = (category: SettingsCategory) => {
    if (isMobile) {
      router.push(`/settings/${category}`);
    } else {
      openSettings(category);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="hover:bg-state-hover data-[state=open]:bg-state-selected flex w-fit items-center gap-2 rounded-lg px-2 py-2 text-left text-sm outline-hidden"
          aria-label={t('navigation.navUser.accountMenuLabel', { name: user.name })}
        >
          <Avatar size="xs" className="rounded-2xl">
            {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
            <AvatarFallback className="bg-foreground text-background rounded-2xl text-xs">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-20 truncate font-normal">{user.name}</span>
          <ChevronDown className="text-muted-foreground size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- Radix CSS variable
        className="border-input w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-2xl"
        side="right"
        align="end"
        sideOffset={4}
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-2 text-left text-sm">
            <Avatar size="xs" className="rounded-2xl">
              {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
              <AvatarFallback className="bg-foreground text-background rounded-2xl text-xs">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-normal">{user.name}</span>
              <span className="text-muted-foreground truncate text-xs">{user.email}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* アカウント関連 */}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleOpenSettings('profile')}>
            <UserCircle />
            {t('navigation.navUser.account')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenSettings('billing')}>
            <Sparkles />
            {t('navigation.navUser.upgradePlan')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleOpenSettings('display')}>
            <Palette />
            {t('navigation.navUser.personalize')}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* 設定とヘルプ */}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => handleOpenSettings('profile')}>
            <Settings />
            {t('navigation.navUser.settings')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <HelpCircle />
              {t('navigation.navUser.help')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="border-input">
              <DropdownMenuItem asChild>
                <Link
                  href="https://github.com/t3-nico/dayopt/releases"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Megaphone />
                  {t('navigation.navUser.helpSubmenu.releaseNotes')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="https://docs.dayopt.app" target="_blank" rel="noopener noreferrer">
                  <Book />
                  <span className="flex-1">
                    {t('navigation.navUser.helpSubmenu.documentation')}
                  </span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a
                  href={`https://dayopt.app/${locale}/legal/terms`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText />
                  <span className="flex-1">
                    {t('navigation.navUser.helpSubmenu.termsOfService')}
                  </span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`https://dayopt.app/${locale}/legal/privacy`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <FileText />
                  <span className="flex-1">
                    {t('navigation.navUser.helpSubmenu.privacyPolicy')}
                  </span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`https://dayopt.app/${locale}/legal/tokushoho`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Building />
                  <span className="flex-1">{t('navigation.navUser.helpSubmenu.tokushoho')}</span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a
                  href={`https://dayopt.app/${locale}/legal/security`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Shield />
                  <span className="flex-1">{t('navigation.navUser.helpSubmenu.security')}</span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => openSheet({ type: 'contact' })}>
                <MessageSquare />
                {t('navigation.navUser.helpSubmenu.contact')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* ログアウト */}
        <DropdownMenuItem variant="destructive" onClick={logout} disabled={isLoggingOut}>
          <LogOut />
          {isLoggingOut ? t('navigation.navUser.loggingOut') : t('navigation.navUser.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
