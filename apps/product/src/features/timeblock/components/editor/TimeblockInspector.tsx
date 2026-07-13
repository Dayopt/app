'use client';

/**
 * Time Model Inspector（Level 1）
 *
 * plans / records を対象にした Inspector シェル:
 * - store 読み取り（timeblockId + timeblockKind）、kind 別 getById、loading/empty 分岐
 * - レスポンシブ分岐（mobile=Drawer / PC=FloatingPopover）
 * - keyboard ショートカット、URL同期
 *
 * 旧 TimeblockInspector（entries 用）の置き換え。旧実装は Step 9 で削除する。
 */

import { Suspense, useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { api } from '@/lib/trpc';
import { Drawer, DrawerContent, DrawerTitle, Spinner } from '@dayopt/components';

import { useInspectorURLSync } from '../../hooks/useInspectorURLSync';
import { useTimeblockInspectorStore } from '../../stores/useTimeblockInspectorStore';
import { FloatingPopover } from '../inspector/FloatingPopover';
import { useInspectorKeyboard } from '../inspector/hooks';
import { TimeblockInspectorForm } from './TimeblockInspectorForm';

/** URL同期（useSearchParams は Suspense が必要なため分離） */
function InspectorURLSyncHandler() {
  useInspectorURLSync();
  return null;
}

interface TimeModelInspectorProps {
  /** 振り返り panel を開くコールバック（Composition Layer から注入） */
  onViewStats?: ((tagId: string) => void) | undefined;
}

/** plans / records 対応 Inspector のトップレベル（モバイル=Drawer / PC=FloatingPopover） */
export function TimeblockInspector({ onViewStats }: TimeModelInspectorProps) {
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const isOpen = useTimeblockInspectorStore((state) => state.isOpen);
  const timeblockId = useTimeblockInspectorStore((state) => state.timeblockId);
  const timeblockKind = useTimeblockInspectorStore((state) => state.timeblockKind);
  const anchorRect = useTimeblockInspectorStore((state) => state.anchorRect);
  const closeInspector = useTimeblockInspectorStore((state) => state.closeInspector);

  const planQuery = api.plans.getById.useQuery(
    { id: timeblockId ?? '' },
    { enabled: isOpen && !!timeblockId && timeblockKind === 'plan' },
  );
  const recordQuery = api.records.getById.useQuery(
    { id: timeblockId ?? '' },
    { enabled: isOpen && !!timeblockId && timeblockKind === 'record' },
  );
  // 過去 plan の記録済み判定（RecordPlanButton / skip 表示の切替に使う）
  const recordedQuery = api.records.list.useQuery(
    { planId: timeblockId ?? '', limit: 1 },
    { enabled: isOpen && !!timeblockId && timeblockKind === 'plan' },
  );

  const activeQuery = timeblockKind === 'plan' ? planQuery : recordQuery;
  const plan = timeblockKind === 'plan' ? planQuery.data : undefined;
  const record = timeblockKind === 'record' ? recordQuery.data : undefined;
  const target = plan ?? record;

  const handleClose = useCallback(() => {
    closeInspector();
  }, [closeInspector]);

  useInspectorKeyboard({
    isOpen,
    onClose: handleClose,
  });

  // --- コンテンツ（loading / error / empty / form） ---
  const title = target?.title || t('timeblock.inspector.noTitle');
  let content: React.ReactNode;

  if (activeQuery.isLoading) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  } else if (activeQuery.isError) {
    content = (
      <ErrorState
        title={t('error.boundary.title')}
        onRetry={() => activeQuery.refetch()}
        size="sm"
        centered
      />
    );
  } else if (!target) {
    content = (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('timeblock.inspector.notFound')}</p>
      </div>
    );
  } else {
    content = (
      <TimeblockInspectorForm
        key={`${timeblockKind}:${target.id}:${target.updated_at}`}
        kind={timeblockKind}
        plan={plan}
        record={record}
        isRecorded={(recordedQuery.data?.length ?? 0) > 0}
        onViewStats={onViewStats}
        onCloseInspector={isMobile ? handleClose : undefined}
        onDeleted={handleClose}
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
        <Drawer
          open={isOpen}
          onOpenChange={(open) => !open && handleClose()}
          handleOnly
          repositionInputs={false}
        >
          <DrawerContent className="flex flex-col gap-0 overflow-hidden p-0">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-lg">{content}</div>
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
