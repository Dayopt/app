'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { Avatar, AvatarFallback, AvatarImage, cn } from '@dayopt/components';

const LOCALE_PREFIX_PATTERN = /^\/(en|ja)(?=\/|$)/;

function getLocaleFromPathname(pathname: string | null | undefined): 'ja' | 'en' {
  const segments = pathname?.split('/') ?? [];
  return segments.length >= 2 && (segments[1] === 'ja' || segments[1] === 'en')
    ? segments[1]
    : 'ja';
}

function buildSettingsReturnPath(
  pathname: string | null,
  searchParams: { toString: () => string },
): string {
  const pathWithoutLocale = (pathname ?? '').replace(LOCALE_PREFIX_PATTERN, '') || '/day';
  const query = searchParams.toString();

  return query ? `${pathWithoutLocale}?${query}` : pathWithoutLocale;
}

interface MobileAccountButtonProps {
  href: string;
  displayName: string;
  avatarUrl?: string | null | undefined;
  ariaLabel: string;
  className?: string | undefined;
}

export function MobileAccountButton({
  href,
  displayName,
  avatarUrl,
  ariaLabel,
  className,
}: MobileAccountButtonProps) {
  return (
    <Link
      href={href}
      prefetch
      aria-label={ariaLabel}
      className={cn(
        'hover:bg-state-hover focus-visible:outline-ring flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-2',
        className,
      )}
    >
      <Avatar size="sm">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
          {getInitials(displayName)}
        </AvatarFallback>
      </Avatar>
    </Link>
  );
}

export function ConnectedMobileAccountButton({ className }: { className?: string | undefined }) {
  const t = useTranslations();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const locale = getLocaleFromPathname(pathname);
  const displayName = getDisplayName(user, 'User');
  const returnPath = buildSettingsReturnPath(pathname, searchParams);

  return (
    <MobileAccountButton
      href={`/${locale}/settings?returnTo=${encodeURIComponent(returnPath)}`}
      displayName={displayName}
      avatarUrl={getAvatarUrl(user)}
      ariaLabel={t('navigation.navUser.account')}
      className={className}
    />
  );
}
