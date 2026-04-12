'use client';

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { RecentBlocks } from '@/features/history';
import { Palette, usePaletteMutations } from '@/features/palette';
import { useShellStore } from '@/lib/stores/useShellStore';

const SNAP_POINTS = [0.95] as const;

/** モバイル用作成ボトムシート — Palette + RecentBlocks（Composition Layer） */
export function MobileCreateSheet() {
  const t = useTranslations();
  const activeSheet = useShellStore((s) => s.activeSheet);
  const open = activeSheet?.type === 'mobileCreate';
  const openSheet = useShellStore((s) => s.openSheet);
  const closeSheet = useShellStore((s) => s.closeSheet);
  const setOpen = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        openSheet({ type: 'mobileCreate' });
      } else {
        closeSheet();
      }
    },
    [openSheet, closeSheet],
  );
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
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- CSS unset override */}
      <DrawerContent className="max-h-[unset] rounded-t-2xl">
        <VisuallyHidden asChild>
          <DrawerTitle>Create</DrawerTitle>
        </VisuallyHidden>

        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto pb-8"
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
