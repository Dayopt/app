'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { useMobileFilterSheetStore } from '@/shell/stores/useMobileFilterSheetStore';

/** モバイル用フィルターシート開閉ボタン（md:hidden） */
export function MobileFilterButton() {
  const setOpen = useMobileFilterSheetStore((s) => s.setOpen);
  const t = useTranslations();

  return (
    <Button
      variant="ghost"
      icon
      className="size-8 md:hidden"
      onClick={() => setOpen(true)}
      aria-label={t('navigation.sidebar.views')}
    >
      <SlidersHorizontal className="size-4" />
    </Button>
  );
}
