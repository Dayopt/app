'use client';

import { Input } from '@/components/ui/input';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Link } from '@/platform/i18n/navigation';
import { Button, Logo } from '@dayopt/components';
import { Menu, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface DocsHeaderProps {
  onMobileMenuToggle?: () => void;
  mobileMenuOpen?: boolean;
}

export function DocsHeader({ onMobileMenuToggle, mobileMenuOpen }: DocsHeaderProps) {
  const t = useTranslations('common');

  return (
    <header className="bg-background border-border z-dropdown w-full flex-shrink-0 border-b">
      <nav
        className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 lg:px-6"
        aria-label={t('aria.docsNavigation')}
      >
        {/* Left: Mobile menu toggle + Logo */}
        <div className="flex shrink-0 items-center gap-4">
          {/* Mobile menu toggle */}
          <Button
            variant="ghost"
            icon
            size="sm"
            onClick={onMobileMenuToggle}
            className="lg:hidden"
            aria-label={mobileMenuOpen ? t('aria.closeMenu') : t('aria.openMenu')}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>

          {/* Logo → marketing home, Docs badge → docs home */}
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center">
              <Logo variant="wordmark" size="md" className="text-foreground" />
            </Link>
            <Link
              href="/docs"
              className="bg-muted text-muted-foreground hover:text-foreground rounded px-2 py-1 text-xs font-medium transition-colors"
            >
              Docs
            </Link>
          </div>
        </div>

        {/* Center: Search */}
        <div className="relative hidden max-w-80 min-w-0 flex-1 lg:block">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input type="search" placeholder={t('actions.search')} size="sm" className="pl-8" />
        </div>

        {/* Right: Actions */}
        <div className="ml-auto flex shrink-0 items-center gap-0">
          <ThemeToggle />
          <LanguageSwitcher />
          <div className="ml-2 hidden items-center gap-x-2 sm:flex">
            <Button variant="ghost" size="default" asChild>
              <Link href="/login">{t('actions.login')}</Link>
            </Button>
            <Button variant="primary" size="default" asChild>
              <Link href="/signup">{t('actions.signup')}</Link>
            </Button>
          </div>
        </div>
      </nav>
    </header>
  );
}
