'use client';

import { useEffect, type RefObject } from 'react';

import { useTimeblockInspectorStore } from '@/features/timeblock';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

import { useActivityDraftStore } from '../../../../stores/useActivityDraftStore';

interface UseScrollEntryIntoViewOptions {
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  hourHeight: number;
}

function scrollToTopPx(container: HTMLDivElement, topPx: number) {
  const targetScroll = Math.max(0, topPx - container.clientHeight * 0.25);
  container.scrollTo({ top: targetScroll, behavior: 'smooth' });
}

/**
 * Mobile + Inspector / Tag draft open のとき、対象 entry / draft が Drawer の上に
 * visible になるよう scroll する。
 *
 * Mobile では Drawer が下半分を覆うため、選択された entry や作成中 draft が隠れる。
 * 対象を viewport の上端から ~25% の位置に置く。
 *
 * PC では何もしない（Inspector は右ドッキングパネルで entry を覆わないため）。
 */
export function useScrollTimeblockIntoView({
  scrollContainerRef,
  hourHeight,
}: UseScrollEntryIntoViewOptions) {
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const inspectorEntryId = useTimeblockInspectorStore((s) => s.timeblockId);
  const inspectorIsOpen = useTimeblockInspectorStore((s) => s.isOpen);
  const activityDraft = useActivityDraftStore((s) => s.draft);

  // Inspector 開時: 該当 entry を viewport の 25% に置く
  useEffect(() => {
    if (!isMobile) return;
    if (!inspectorIsOpen || !inspectorEntryId) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const timer = setTimeout(() => {
      const timeblockEl = container.querySelector<HTMLElement>(
        `[data-entry-id="${inspectorEntryId}"]`,
      );
      if (!timeblockEl) return;
      const containerRect = container.getBoundingClientRect();
      const timeblockRect = timeblockEl.getBoundingClientRect();
      const timeblockTopInContainer = timeblockRect.top - containerRect.top + container.scrollTop;
      scrollToTopPx(container, timeblockTopInContainer);
    }, 220);

    return () => clearTimeout(timer);
  }, [isMobile, inspectorIsOpen, inspectorEntryId, scrollContainerRef]);

  // Tag draft open 時: draft の startTime を viewport の 25% に置く
  // activityDraft.activity.id を deps に含めて「別アクティビティに切り替わった」場合だけ再 scroll する
  // （resize で startTime/endTime が動いたときに毎回 scroll しないように）
  useEffect(() => {
    if (!isMobile) return;
    if (!activityDraft) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const timer = setTimeout(() => {
      const [h, m] = activityDraft.startTime.split(':').map(Number);
      const startMinutes = (h ?? 0) * 60 + (m ?? 0);
      const topPx = startMinutes * (hourHeight / 60);
      scrollToTopPx(container, topPx);
    }, 220);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startTime/endTime の変化では re-scroll しない（アクティビティ切替時のみ）
  }, [isMobile, activityDraft?.activity.id, hourHeight, scrollContainerRef]);
}
