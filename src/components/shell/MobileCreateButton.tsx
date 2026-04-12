'use client';

import { SquarePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useShellStore } from '@/lib/stores/useShellStore';

/** モバイル用作成シート開閉ボタン（md:hidden） */
export function MobileCreateButton() {
  const openSheet = useShellStore((s) => s.openSheet);
  const t = useTranslations();

  return (
    <Button
      variant="ghost"
      icon
      className="size-8 md:hidden"
      onClick={() => openSheet({ type: 'mobileCreate' })}
      aria-label={t('navigation.sidebar.quickCreate')}
    >
      <SquarePlus className="size-5" />
    </Button>
  );
}
