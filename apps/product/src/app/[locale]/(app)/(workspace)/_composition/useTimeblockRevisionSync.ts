'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { api } from '@/lib/trpc';

const REVISION_POLL_INTERVAL_MS = 10_000;

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

function subscribeToDocumentVisibility(onStoreChange: () => void): () => void {
  document.addEventListener('visibilitychange', onStoreChange);
  return () => {
    document.removeEventListener('visibilitychange', onStoreChange);
  };
}

/**
 * 外部接続面で更新された Plan / Record を、表示中の workspace cache へ反映する。
 * 非表示中は polling を止め、復帰時に revision を即時再確認する。
 */
export function useTimeblockRevisionSync(): void {
  const utils = api.useUtils();
  const isVisible = useSyncExternalStore(
    subscribeToDocumentVisibility,
    isDocumentVisible,
    () => true,
  );
  const previousVisibilityRef = useRef(isVisible);
  const lastInvalidatedRevisionRef = useRef<string | null>(null);
  const { data, refetch } = api.timeblockContext.getRevision.useQuery(undefined, {
    enabled: isVisible,
    refetchInterval: isVisible ? REVISION_POLL_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const wasVisible = previousVisibilityRef.current;
    previousVisibilityRef.current = isVisible;
    if (!wasVisible && isVisible) {
      void refetch();
    }
  }, [isVisible, refetch]);

  useEffect(() => {
    const revision = data?.revision;
    if (!isVisible || !revision || lastInvalidatedRevisionRef.current === revision) {
      return;
    }

    lastInvalidatedRevisionRef.current = revision;
    void Promise.all([
      utils.plans.invalidate(),
      utils.records.invalidate(),
      utils.statistics.invalidate(),
    ]);
  }, [data?.revision, isVisible, utils]);
}
