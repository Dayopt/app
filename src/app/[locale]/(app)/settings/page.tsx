'use client';

import { Link, useRouter } from '@/platform/i18n/navigation';
import { useEffect } from 'react';

import {
  Book,
  Building,
  ChevronRight,
  ExternalLink,
  FileText,
  LogOut,
  Megaphone,
  MessageSquare,
  Shield,
  Sparkles,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SETTINGS_CATEGORIES } from '@/features/settings';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { useLogout } from '@/shell/hooks/useLogout';
import { useContactStore } from '@/shell/stores/useContactStore';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * 設定ページのルート
 *
 * PC: /settings/profile にリダイレクト
 * Mobile: Instagram風アカウント概要ページ
 */
export default function SettingsPage() {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const { logout, isLoggingOut } = useLogout();
  const openContact = useContactStore((s) => s.open);

  const displayName = getDisplayName(user, t('navigation.navUser.account'));
  const avatarUrl = getAvatarUrl(user);
  const initials = getInitials(displayName);

  // PC: デフォルトカテゴリにリダイレクト
  useEffect(() => {
    if (!isMobile) {
      router.replace('/settings/profile');
    }
  }, [isMobile, router]);

  if (!isMobile) {
    return null;
  }

  const helpLinks: Array<{
    labelKey: string;
    href: string;
    icon: typeof FileText;
    external?: boolean;
    onPress?: () => void;
  }> = [
    {
      labelKey: 'settings.accountPage.releaseNotes',
      href: 'https://github.com/t3-nico/dayopt/releases',
      icon: Megaphone,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.documentation',
      href: 'https://docs.dayopt.app',
      icon: Book,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.termsOfService',
      href: `https://dayopt.app/${locale}/legal/terms`,
      icon: FileText,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.privacyPolicy',
      href: `https://dayopt.app/${locale}/legal/privacy`,
      icon: FileText,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.tokushoho',
      href: `https://dayopt.app/${locale}/legal/tokushoho`,
      icon: Building,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.security',
      href: `https://dayopt.app/${locale}/legal/security`,
      icon: Shield,
      external: true,
    },
    {
      labelKey: 'settings.accountPage.contact',
      href: '#',
      icon: MessageSquare,
      onPress: () => openContact(),
    },
  ];

  // Mobile: Instagram風アカウント概要ページ
  return (
    <>
      <header className="border-border flex h-14 shrink-0 items-center border-b px-4">
        <h1 className="text-lg font-bold">{t('navigation.navUser.myAccount')}</h1>
      </header>
      <ScrollArea className="flex-1">
        {/* ヒーローエリア */}
        <div className="flex flex-col items-center gap-3 px-4 py-6">
          <Avatar size="xl">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
            <AvatarFallback className="bg-foreground text-background text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <p className="text-lg font-semibold">{displayName}</p>
            {user?.email && <p className="text-muted-foreground text-sm">{user.email}</p>}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => router.push('/settings/billing')}
          >
            <Sparkles className="size-4" />
            {t('navigation.navUser.upgradePlan')}
          </Button>
        </div>

        {/* 設定カテゴリ */}
        <nav className="flex flex-col gap-1 p-2">
          {SETTINGS_CATEGORIES.map((category) => {
            const Icon = category.icon;
            return (
              <Link
                key={category.id}
                href={`/settings/${category.id}`}
                className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
              >
                <Icon className="size-5 shrink-0" />
                <span className="flex-1 font-normal">{t(category.labelKey)}</span>
                <ChevronRight className="text-muted-foreground size-4" />
              </Link>
            );
          })}
        </nav>

        {/* ヘルプ & サポート */}
        <div className="border-border border-t px-2 pt-2">
          <h2 className="text-muted-foreground px-4 py-2 text-xs font-medium">
            {t('settings.accountPage.helpAndSupport')}
          </h2>
          <nav className="flex flex-col gap-1">
            {helpLinks.map((link) => {
              const Icon = link.icon;
              if (link.onPress) {
                return (
                  <button
                    key={link.labelKey}
                    type="button"
                    onClick={link.onPress}
                    className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="flex-1 font-normal">{t(link.labelKey)}</span>
                  </button>
                );
              }
              return (
                <a
                  key={link.labelKey}
                  href={link.href}
                  target={link.external ? '_blank' : undefined}
                  rel={link.external ? 'noopener noreferrer' : undefined}
                  className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="flex-1 font-normal">{t(link.labelKey)}</span>
                  {link.external && <ExternalLink className="text-muted-foreground size-3.5" />}
                </a>
              );
            })}
          </nav>
        </div>

        {/* ログアウト */}
        <div className="border-border border-t p-4">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-start gap-3"
            onClick={logout}
            disabled={isLoggingOut}
          >
            <LogOut className="size-5" />
            {isLoggingOut ? t('navigation.navUser.loggingOut') : t('navigation.navUser.logout')}
          </Button>
        </div>
      </ScrollArea>
    </>
  );
}
