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

import { Suspense, useCallback, useEffect, useRef } from 'react';

import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { api } from '@/lib/trpc';
import { Drawer, DrawerContent, DrawerTitle, Spinner } from '@dayopt/components';

import type { TimeblockDestination } from '../../domain/timeblock-destination';
import { useInspectorURLSync } from '../../hooks/useInspectorURLSync';
import type { ClipboardTimeblock } from '../../lib/timeblock-clipboard';
import { useTimeblockInspectorStore } from '../../stores/useTimeblockInspectorStore';
import { FloatingPopover } from '../inspector/FloatingPopover';
import { useInspectorKeyboard } from '../inspector/hooks';
import { TimeblockInspectorForm, type TimeblockRelationships } from './TimeblockInspectorForm';

/** URL同期（useSearchParams は Suspense が必要なため分離） */
function InspectorURLSyncHandler() {
  useInspectorURLSync();
  return null;
}

interface TimeModelInspectorProps {
  /** 振り返り panel を開くコールバック（Composition Layer から注入） */
  onViewStats?: ((tagId: string) => void) | undefined;
  /** Timeblockを独立複製用のクリップボードへ保存する。 */
  onCopy?: ((timeblock: ClipboardTimeblock) => void) | undefined;
}

const INSPECTOR_FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** plans / records 対応 Inspector のトップレベル（モバイル=Drawer / PC=FloatingPopover） */
export function TimeblockInspector({ onViewStats, onCopy }: TimeModelInspectorProps) {
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);

  const isOpen = useTimeblockInspectorStore((state) => state.isOpen);
  const timeblockId = useTimeblockInspectorStore((state) => state.timeblockId);
  const timeblockKind = useTimeblockInspectorStore((state) => state.timeblockKind);
  const anchorRect = useTimeblockInspectorStore((state) => state.anchorRect);
  const duplicateDraft = useTimeblockInspectorStore((state) => state.duplicateDraft);
  const openInspector = useTimeblockInspectorStore((state) => state.openInspector);
  const openDuplicate = useTimeblockInspectorStore((state) => state.openDuplicate);
  const cancelDuplicate = useTimeblockInspectorStore((state) => state.cancelDuplicate);
  const closeInspector = useTimeblockInspectorStore((state) => state.closeInspector);
  const contentRef = useRef<HTMLDivElement>(null);
  const shouldFocusRelationshipRef = useRef(false);

  const planQuery = api.plans.getById.useQuery(
    { id: timeblockId ?? '' },
    { enabled: isOpen && !duplicateDraft && !!timeblockId && timeblockKind === 'plan' },
  );
  const recordQuery = api.records.getById.useQuery(
    { id: timeblockId ?? '' },
    { enabled: isOpen && !duplicateDraft && !!timeblockId && timeblockKind === 'record' },
  );
  const relatedRecordsQuery = api.records.list.useQuery(
    { planId: timeblockId ?? '', sortBy: 'start_at', sortOrder: 'asc' },
    { enabled: isOpen && !duplicateDraft && !!timeblockId && timeblockKind === 'plan' },
  );
  const originalPlanId = timeblockKind === 'record' ? recordQuery.data?.plan_id : null;
  const originalPlanQuery = api.plans.getById.useQuery(
    { id: originalPlanId ?? '' },
    {
      enabled: isOpen && !duplicateDraft && !!originalPlanId && timeblockKind === 'record',
      retry: (failureCount, error) => (error.data?.code === 'NOT_FOUND' ? false : failureCount < 3),
    },
  );

  const activeQuery = timeblockKind === 'plan' ? planQuery : recordQuery;
  const plan = timeblockKind === 'plan' ? planQuery.data : undefined;
  const record = timeblockKind === 'record' ? recordQuery.data : undefined;
  const target = plan ?? record;

  const handleOpenRelationship = useCallback(
    (id: string, kind: TimeblockDestination) => {
      shouldFocusRelationshipRef.current = true;
      openInspector(id, kind);
    },
    [openInspector],
  );

  const handleClose = useCallback(() => {
    shouldFocusRelationshipRef.current = false;
    closeInspector();
  }, [closeInspector]);

  const handleCancelDuplicate = useCallback(() => {
    shouldFocusRelationshipRef.current = true;
    cancelDuplicate();
  }, [cancelDuplicate]);

  useEffect(() => {
    if (!isOpen || activeQuery.isLoading || !shouldFocusRelationshipRef.current) return;

    shouldFocusRelationshipRef.current = false;
    const content = contentRef.current;
    if (!content) return;

    const focusTarget = content.querySelector<HTMLElement>(INSPECTOR_FOCUSABLE_SELECTOR);
    (focusTarget ?? content).focus();
  }, [activeQuery.isLoading, duplicateDraft, isOpen, target?.id, timeblockKind]);

  let relationships: TimeblockRelationships | undefined;
  if (!duplicateDraft && timeblockKind === 'plan') {
    const status: 'loading' | 'error' | 'success' = relatedRecordsQuery.isError
      ? 'error'
      : relatedRecordsQuery.isSuccess
        ? 'success'
        : 'loading';
    relationships = {
      kind: 'plan',
      status,
      records: relatedRecordsQuery.data ?? [],
      onRetry: () => void relatedRecordsQuery.refetch(),
    };
  } else if (!duplicateDraft && originalPlanId) {
    const isUnavailable = originalPlanQuery.error?.data?.code === 'NOT_FOUND';
    const status: 'loading' | 'error' | 'success' | 'unavailable' = isUnavailable
      ? 'unavailable'
      : originalPlanQuery.isError
        ? 'error'
        : originalPlanQuery.isSuccess
          ? 'success'
          : 'loading';
    relationships = {
      kind: 'record',
      status,
      plan: originalPlanQuery.data ?? null,
      onRetry: () => void originalPlanQuery.refetch(),
    };
  }

  useInspectorKeyboard({
    isOpen,
    onClose: handleClose,
  });

  // --- コンテンツ（loading / error / empty / form） ---
  const title = duplicateDraft?.title || target?.title || t('timeblock.inspector.noTitle');
  let content: React.ReactNode;

  if (duplicateDraft) {
    content = (
      <TimeblockInspectorForm
        key={`duplicate:${duplicateDraft.kind}:${duplicateDraft.sourceId}`}
        kind={duplicateDraft.kind}
        duplicateDraft={duplicateDraft}
        onCancelDuplicate={handleCancelDuplicate}
        onDuplicateCreated={handleOpenRelationship}
        onCloseInspector={isMobile ? handleClose : undefined}
        onDeleted={handleClose}
      />
    );
  } else if (activeQuery.isLoading) {
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
        key={`${timeblockKind}:${target.id}`}
        kind={timeblockKind}
        plan={plan}
        record={record}
        relationships={relationships}
        onOpenRelationship={handleOpenRelationship}
        onViewStats={onViewStats}
        onCopy={onCopy}
        onStartDuplicate={openDuplicate}
        onCloseInspector={isMobile ? handleClose : undefined}
        onDeleted={handleClose}
      />
    );
  }

  const contentElement = (
    <div ref={contentRef} tabIndex={-1} className="focus:outline-none">
      {content}
    </div>
  );

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
              <div className="mx-auto w-full max-w-lg">{contentElement}</div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <FloatingPopover onClose={handleClose} title={title} anchorRect={anchorRect}>
          {contentElement}
        </FloatingPopover>
      )}
    </>
  );
}
