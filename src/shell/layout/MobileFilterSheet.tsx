'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { CalendarFilterList, ViewSwitcherList } from '@/features/calendar';
import { Palette } from '@/features/palette';
import { useMobileFilterSheetStore } from '@/shell/stores/useMobileFilterSheetStore';

const SNAP_POINTS = [0.55, 1] as const;

/** モバイル用フィルター・パレットボトムシート（Composition Layer） */
export function MobileFilterSheet() {
  const t = useTranslations();
  const open = useMobileFilterSheetStore((s) => s.open);
  const setOpen = useMobileFilterSheetStore((s) => s.setOpen);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSnap(SNAP_POINTS[0]);
      }
    },
    [setOpen],
  );

  return (
    <Drawer
      open={open}
      onOpenChange={handleOpenChange}
      snapPoints={SNAP_POINTS as unknown as number[]}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
      fadeFromIndex={0}
    >
      <DrawerContent className="rounded-t-xl">
        <DrawerHeader>
          <DrawerTitle>{t('navigation.sidebar.views')}</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-w-0 flex-col gap-4 overflow-y-auto px-4 pb-8">
          <ViewSwitcherList />
          <CalendarFilterList />
          <Palette />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
