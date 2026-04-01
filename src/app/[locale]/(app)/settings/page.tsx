'use client';

import { Link, useRouter } from '@/platform/i18n/navigation';
import { useEffect, useState } from 'react';

import {
  Book,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  LogOut,
  Megaphone,
  MessageSquare,
  Scale,
  Sparkles,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SETTINGS_CATEGORIES } from '@/features/settings';
import { useHasMounted } from '@/hooks/useHasMounted';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { APP_NAME, APP_RELEASES_URL, APP_VERSION } from '@/lib/app-info';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { useLogout } from '@/shell/hooks/useLogout';
import { useShellStore } from '@/shell/stores/useShellStore';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * 設定ページのルート
 *
 * PC: ホームにリダイレクトし、設定モーダルを開く
 * Mobile: Instagram風アカウント概要ページ
 */
export default function SettingsPage() {
  const hasMounted = useHasMounted();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const t = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const user = useAuthStore((s) => s.user);
  const { logout, isLoggingOut } = useLogout();
  const openContact = useShellStore((s) => s.openSheet);
  const openSettings = useShellStore((s) => s.openSettings);
  const [legalOpen, setLegalOpen] = useState(false);

  const displayName = getDisplayName(user, t('navigation.navUser.account'));
  const avatarUrl = getAvatarUrl(user);
  const initials = getInitials(displayName);

  // PC: ホームにリダイレクトし、設定モーダルを開く
  useEffect(() => {
    if (hasMounted && !isMobile) {
      openSettings('profile');
      router.replace('/');
    }
  }, [hasMounted, isMobile, openSettings, router]);

  if (!hasMounted || !isMobile) {
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
      href: APP_RELEASES_URL,
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
      labelKey: 'settings.accountPage.contact',
      href: '#',
      icon: MessageSquare,
      onPress: () => openContact({ type: 'contact' }),
    },
  ];

  const legalLinks: Array<{
    labelKey: string;
    href: string;
  }> = [
    {
      labelKey: 'settings.accountPage.termsOfService',
      href: `https://dayopt.app/${locale}/legal/terms`,
    },
    {
      labelKey: 'settings.accountPage.privacyPolicy',
      href: `https://dayopt.app/${locale}/legal/privacy`,
    },
    {
      labelKey: 'settings.accountPage.tokushoho',
      href: `https://dayopt.app/${locale}/legal/tokushoho`,
    },
    {
      labelKey: 'settings.accountPage.security',
      href: `https://dayopt.app/${locale}/legal/security`,
    },
  ];

  // Mobile: Instagram風アカウント概要ページ
  return (
    <ScrollArea className="flex-1">
      {/* B. ヒーローエリア（タップでプロフィール遷移） */}
      <Link href="/settings/profile" className="block">
        <div className="flex flex-col items-center gap-4 px-4 pt-8 pb-6">
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
        </div>
      </Link>
      {/* Upgrade ボタンはリンク外 */}
      <div className="flex justify-center pb-6">
        <Button variant="primary" size="sm" onClick={() => router.push('/settings/billing')}>
          <Sparkles className="size-4" />
          {t('navigation.navUser.upgradePlan')}
        </Button>
      </div>

      {/* 設定カテゴリ */}
      <nav className="flex flex-col p-2">
        {SETTINGS_CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.id}
              href={`/settings/${category.id}`}
              className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
            >
              {/* C. カテゴリアイコン色 */}
              <Icon className="text-muted-foreground size-5 shrink-0" />
              <span className="flex-1 font-normal">{t(category.labelKey)}</span>
              <ChevronRight className="text-muted-foreground size-4" />
            </Link>
          );
        })}
      </nav>

      {/* ヘルプ & サポート */}
      <div className="border-border border-t px-2 pt-1">
        <nav className="flex flex-col">
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
                  {/* C. アイコン色 */}
                  <Icon className="text-muted-foreground size-5 shrink-0" />
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
                {/* C. アイコン色 */}
                <Icon className="text-muted-foreground size-5 shrink-0" />
                <span className="flex-1 font-normal">{t(link.labelKey)}</span>
                {link.external && <ExternalLink className="text-muted-foreground size-3.5" />}
              </a>
            );
          })}

          {/* E. 法的情報の折りたたみ */}
          <button
            type="button"
            onClick={() => setLegalOpen((prev) => !prev)}
            className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
          >
            <Scale className="text-muted-foreground size-5 shrink-0" />
            <span className="flex-1 font-normal">{t('settings.accountPage.legal')}</span>
            <ChevronDown
              className={`text-muted-foreground size-4 transition-transform ${legalOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- grid expand/collapse animation
            className={`grid transition-[grid-template-rows] duration-200 ${legalOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          >
            <div className="overflow-hidden">
              {legalLinks.map((link) => (
                <a
                  key={link.labelKey}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg py-4 pr-4 pl-12 text-left text-sm transition-colors"
                >
                  <span className="flex-1 font-normal">{t(link.labelKey)}</span>
                  <ExternalLink className="text-muted-foreground size-3.5" />
                </a>
              ))}
            </div>
          </div>
        </nav>
      </div>

      {/* ログアウト */}
      <div className="border-border border-t px-2 pt-1 pb-24">
        <button
          type="button"
          onClick={logout}
          disabled={isLoggingOut}
          className="text-destructive hover:bg-state-hover active:bg-state-hover flex w-full items-center gap-4 rounded-lg px-4 py-4 text-left text-sm transition-colors"
        >
          <LogOut className="text-destructive size-5 shrink-0" />
          <span className="flex-1 font-normal">
            {isLoggingOut ? t('navigation.navUser.loggingOut') : t('navigation.navUser.logout')}
          </span>
        </button>

        {/* バージョン表示 */}
        <p className="text-muted-foreground mt-2 px-4 text-xs">
          {APP_NAME} v{APP_VERSION}
        </p>
      </div>
    </ScrollArea>
  );
}
