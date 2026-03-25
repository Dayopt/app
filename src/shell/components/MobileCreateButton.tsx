'use client';

import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useMobileCreateSheetStore } from '@/shell/stores/useMobileCreateSheetStore';

/** モバイル用作成シート開閉ボタン（md:hidden） */
export function MobileCreateButton() {
  const setOpen = useMobileCreateSheetStore((s) => s.setOpen);
  const t = useTranslations();

  return (
    <Button
      variant="ghost"
      icon
      className="size-8 md:hidden"
      onClick={() => setOpen(true)}
      aria-label={t('navigation.sidebar.quickCreate')}
    >
      <Plus className="size-4" />
    </Button>
  );
}
