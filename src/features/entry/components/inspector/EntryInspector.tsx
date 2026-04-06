'use client';

/**
 * Entry Inspector（Level 1）
 *
 * 3層アーキテクチャの最上位:
 * - store 読み取り、useEntry()、loading/empty 分岐
 * - レスポンシブ分岐（mobile=Drawer / PC=FloatingPopover）
 * - keyboard ショートカット、URL同期
 *
 * content の重複なし: EntryInspectorForm を一度だけ描画。
 */

import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';

import { ErrorState } from '@/components/common/ErrorState';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useEntry } from '../../hooks/useEntry';
import { useInspectorURLSync } from '../../hooks/useInspectorURLSync';
import { useEntryInspectorStore } from '../../stores/useEntryInspectorStore';
import type { EntryWithTags } from '../../types/entry';
import { EntryInspectorForm } from './EntryInspectorForm';
import { FloatingPopover } from './FloatingPopover';
import { useInspectorKeyboard, useInspectorNavigation } from './hooks';

/** URL同期（useSearchParams は Suspense が必要なため分離） */
function InspectorURLSyncHandler() {
  useInspectorURLSync();
  return null;
}

interface EntryInspectorProps {
  /** パレットへのピン留めコールバック（Composition Layer から注入） */
  onPinToPalette?: ((tagId: string, durationMinutes: number) => void) | undefined;
  /** パレットから解除コールバック（Composition Layer から注入） */
  onUnpinFromPalette?: ((tagId: string, durationMinutes: number) => void) | undefined;
  /** パレット登録済みチェック関数（Composition Layer から注入） */
  isPinnedInPalette?: ((tagId: string, durationMinutes: number) => boolean) | undefined;
  /** 統計を見るコールバック（Composition Layer から注入） */
  onViewStats?: ((tagId: string) => void) | undefined;
}

/** Inspectorのトップレベルコンポーネント（モバイル=Drawer / PC=FloatingPopover でレスポンシブ分岐） */
export function EntryInspector({
  onPinToPalette,
  onUnpinFromPalette,
  isPinnedInPalette,
  onViewStats,
}: EntryInspectorProps) {
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const isOpen = useEntryInspectorStore((state) => state.isOpen);
  const entryId = useEntryInspectorStore((state) => state.entryId);
  const anchorRect = useEntryInspectorStore((state) => state.anchorRect);
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);

  const {
    data: planData,
    isLoading,
    isError,
    refetch,
  } = useEntry(entryId!, {
    includeTags: true,
    enabled: !!entryId,
  });
  const entry: EntryWithTags | null = (planData ?? null) as EntryWithTags | null;

  const handleClose = useCallback(() => {
    closeInspector();
  }, [closeInspector]);

  // ナビゲーション + キーボード
  const { hasPrevious, hasNext, goToPrevious, goToNext } = useInspectorNavigation(entryId);
  useInspectorKeyboard({
    isOpen,
    hasPrevious,
    hasNext,
    onClose: handleClose,
    onPrevious: goToPrevious,
    onNext: goToNext,
  });

  // --- コンテンツ（loading / empty / form） ---
  const title = entry?.title || t('entry.inspector.noTitle');
  let content: React.ReactNode;

  if (isLoading) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  } else if (isError) {
    content = (
      <ErrorState title={t('error.boundary.title')} onRetry={() => refetch()} size="sm" centered />
    );
  } else if (!entry) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('entry.inspector.notFound')}</p>
      </div>
    );
  } else {
    content = (
      <EntryInspectorForm
        onPinToPalette={onPinToPalette}
        onUnpinFromPalette={onUnpinFromPalette}
        isPinnedInPalette={isPinnedInPalette}
        onViewStats={onViewStats}
      />
    );
  }

  // URL同期は常時有効（popstateリスナーをInspector閉じ中も維持するため）
  const urlSyncElement = (
    <Suspense fallback={null}>
      <InspectorURLSyncHandler />
    </Suspense>
  );

  if (!isOpen) return urlSyncElement;

  return (
    <>
      {urlSyncElement}

      {isMobile ? (
        <Drawer open={isOpen} onOpenChange={(open) => !open && handleClose()} handleOnly>
          <DrawerContent className="bg-card z-modal shadow-card flex flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[30rem]">{content}</div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <FloatingPopover onClose={handleClose} title={title} anchorRect={anchorRect}>
          {content}
        </FloatingPopover>
      )}
    </>
  );
}
