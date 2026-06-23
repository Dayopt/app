'use client';

import { useCallback } from 'react';

import { Moon, Sun } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useTheme } from '@/lib/hooks/useTheme';
import { Button, HoverTooltip } from '@dayopt/components';

/** テーマ切替ユーティリティ (全モード共通で Sidebar 下部に表示) */
export function SidebarUtilities() {
  const t = useTranslations();
  const { resolvedTheme, setTheme } = useTheme();

  const handleThemeToggle = useCallback(() => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  }, [resolvedTheme, setTheme]);

  return (
    <div className="flex items-center gap-1 px-2 py-2">
      <HoverTooltip content={resolvedTheme === 'light' ? 'Dark mode' : 'Light mode'} side="right">
        <Button
          variant="ghost"
          icon
          className="size-8"
          onClick={handleThemeToggle}
          aria-label={t('navigation.sidebar.theme')}
        >
          {resolvedTheme === 'light' ? (
            <Moon className="size-4" aria-hidden="true" />
          ) : (
            <Sun className="size-4" aria-hidden="true" />
          )}
        </Button>
      </HoverTooltip>
    </div>
  );
}
