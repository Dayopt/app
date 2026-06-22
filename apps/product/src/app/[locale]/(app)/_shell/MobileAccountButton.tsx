'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { useAuthStore } from '@/features/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/lib/components/ui/avatar';
import { getAvatarUrl, getDisplayName, getInitials } from '@/lib/user';
import { cn } from '@/lib/utils';

import { getLocaleFromPathname } from './navigation-paths';

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
  const user = useAuthStore((s) => s.user);
  const locale = getLocaleFromPathname(pathname);
  const displayName = getDisplayName(user, 'User');

  return (
    <MobileAccountButton
      href={`/${locale}/settings`}
      displayName={displayName}
      avatarUrl={getAvatarUrl(user)}
      ariaLabel={t('navigation.navUser.account')}
      className={className}
    />
  );
}
