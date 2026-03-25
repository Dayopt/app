'use client';

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { RecentBlocks } from '@/features/history';
import { Palette, usePaletteMutations } from '@/features/palette';
import { useMobileCreateSheetStore } from '@/shell/stores/useMobileCreateSheetStore';

const SNAP_POINTS = [0.5, 1] as const;

/** モバイル用作成ボトムシート — Palette + RecentBlocks（Composition Layer） */
export function MobileCreateSheet() {
  const t = useTranslations();
  const open = useMobileCreateSheetStore((s) => s.open);
  const setOpen = useMobileCreateSheetStore((s) => s.setOpen);
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);
  const { pinItem } = usePaletteMutations();

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      if (isOpen) {
        setSnap(SNAP_POINTS[0]);
      }
    },
    [setOpen],
  );

  // 履歴からのピン留め — 成功時にtoastで通知
  const handlePinFromHistory = useCallback(
    (tagId: string, durationMinutes: number) => {
      pinItem(tagId, durationMinutes, {
        onSuccess: () => toast.success(t('sidebar.recentBlocks.pinned')),
      });
    },
    [pinItem, t],
  );

  // ブロッククリック時のみシートを閉じる（data-block-action属性で判定）
  const handleBlockClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-block-action]')) {
        setOpen(false);
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
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-8"
          onClick={handleBlockClick}
          role="presentation"
        >
          <Palette />
          <RecentBlocks onPinItem={handlePinFromHistory} />
        </div>
      </DrawerContent>
    </Drawer>
  );
}
