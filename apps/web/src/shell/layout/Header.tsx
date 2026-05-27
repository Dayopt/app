'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Link } from '@/platform/i18n/navigation';
import { Logo } from '@dayopt/ui';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const t = useTranslations('common');

  const navigation = [
    { name: t('navigation.features'), href: '/#features' },
    { name: t('navigation.pricing'), href: '/#pricing' },
    { name: t('navigation.blog'), href: '/blog' },
    { name: t('navigation.docs'), href: '/docs' },
  ];

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setIsScrolled(window.scrollY > 10);
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'bg-background/95 supports-[backdrop-filter]:bg-background/60 z-dropdown sticky top-0 w-full backdrop-blur transition-shadow',
        isScrolled && 'shadow-elevation-raised',
      )}
    >
      <nav
        className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 lg:px-8"
        aria-label={t('aria.mainNavigation')}
      >
        {/* Logo */}
        <div className="flex lg:flex-1">
          <Link href="/" className="flex items-center gap-2">
            <Logo variant="wordmark" size="md" className="text-foreground" />
          </Link>
        </div>

        {/* Desktop navigation */}
        <div className="hidden lg:flex lg:items-center lg:gap-x-1">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className="text-muted-foreground hover:bg-state-hover hover:text-foreground rounded-lg px-4 py-2 text-base font-medium transition-colors"
            >
              {item.name}
            </Link>
          ))}
        </div>

        {/* Right side actions */}
        <div className="flex flex-1 items-center justify-end gap-x-2">
          {/* Desktop: Login + Signup */}
          <div className="hidden lg:flex lg:items-center lg:gap-x-2">
            <Button variant="ghost" size="default" asChild>
              <Link href="/login">{t('actions.login')}</Link>
            </Button>
            <Button variant="primary" size="default" asChild>
              <Link href="/signup">{t('actions.signup')}</Link>
            </Button>
          </div>

          {/* Mobile: Login + Signup + Menu */}
          <div className="flex items-center gap-x-2 lg:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t('actions.login')}</Link>
            </Button>
            <Button variant="primary" size="sm" asChild>
              <Link href="/signup">{t('actions.signup')}</Link>
            </Button>
            <Button
              variant="ghost"
              icon
              onClick={() => setMobileMenuOpen(true)}
              aria-label={t('aria.openMenu')}
            >
              <Menu className="size-5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Mobile menu */}
      <DialogPrimitive.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="z-sheet bg-overlay fixed inset-0 lg:hidden" />
          <DialogPrimitive.Content className="bg-background border-border data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right z-sheet fixed inset-y-0 right-0 w-full overflow-y-auto border-l px-6 py-6 duration-300 sm:max-w-sm lg:hidden">
            <DialogPrimitive.Title className="sr-only">
              {t('aria.navigationMenu')}
            </DialogPrimitive.Title>
            <div className="flex items-center justify-between">
              <Link
                href="/"
                className="flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Logo variant="wordmark" size="md" className="text-foreground" />
              </Link>
              <DialogPrimitive.Close className="text-muted-foreground hover:bg-state-hover hover:text-foreground -m-2 rounded-lg p-2 transition-colors">
                <span className="sr-only">{t('aria.closeMenu')}</span>
                <X className="size-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-6 flow-root">
              <div className="divide-border -my-6 divide-y">
                <div className="space-y-1 py-6">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="text-foreground hover:bg-state-hover block rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                    >
                      {item.name}
                    </Link>
                  ))}
                </div>

                <div className="py-6">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href="/login" onClick={() => setMobileMenuOpen(false)}>
                      {t('actions.login')}
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </header>
  );
}
