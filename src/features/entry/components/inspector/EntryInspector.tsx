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

import { useState } from 'react';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Spinner } from '@/components/ui/spinner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
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

/** モバイル Drawer のスナップポイント */
const SNAP_POINTS = [1] as const;

/** Inspectorのトップレベルコンポーネント（モバイル=Drawer / PC=FloatingPopover でレスポンシブ分岐） */
export function EntryInspector() {
  const t = useTranslations();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [snap, setSnap] = useState<number | string | null>(SNAP_POINTS[0]);

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
  const title = entry?.title || t('plan.inspector.noTitle');
  let content: React.ReactNode;

  if (isLoading) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  } else if (isError) {
    content = (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-4">
        <AlertTriangle className="text-muted-foreground size-8" />
        <p className="text-muted-foreground text-sm">{t('error.boundary.title')}</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t('error.boundary.retry')}
        </Button>
      </div>
    );
  } else if (!entry) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('plan.inspector.notFound')}</p>
      </div>
    );
  } else {
    content = <EntryInspectorForm />;
  }

  if (!isOpen) return null;

  return (
    <>
      <Suspense fallback={null}>
        <InspectorURLSyncHandler />
      </Suspense>

      {isMobile ? (
        <Drawer
          open={isOpen}
          onOpenChange={(open) => !open && handleClose()}
          snapPoints={SNAP_POINTS as unknown as (number | string)[]}
          activeSnapPoint={snap}
          setActiveSnapPoint={setSnap}
          fadeFromIndex={1}
        >
          <DrawerContent className="bg-card z-modal flex flex-col gap-0 overflow-hidden rounded-t-none p-0 [&>div:first-child]:hidden">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            <div className="flex h-10 shrink-0 items-center justify-center px-2 pt-2">
              <div className="bg-border h-1.5 w-12 rounded-full" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
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
