'use client';

import { useCallback, useMemo } from 'react';

import { useEntries } from '../../../hooks/useEntries';
import { useEntryInspectorStore } from '../../../stores/useEntryInspectorStore';

/** Inspector内でエントリ一覧を前後に移動するフック
 * @param entryId - 現在表示中のエントリID
 * @returns hasPrevious, hasNext, goToPrevious, goToNext
 */
export function useInspectorNavigation(entryId: string | null) {
  const openInspector = useEntryInspectorStore((state) => state.openInspector);

  const { data: allEntries = [] } = useEntries();

  const currentIndex = useMemo(() => {
    return allEntries.findIndex((t) => t.id === entryId);
  }, [allEntries, entryId]);

  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allEntries.length - 1;

  const goToPrevious = useCallback(() => {
    if (hasPrevious) {
      const prevEntryId = allEntries[currentIndex - 1]!.id;
      openInspector(prevEntryId);
    }
  }, [hasPrevious, allEntries, currentIndex, openInspector]);

  const goToNext = useCallback(() => {
    if (hasNext) {
      const nextEntryId = allEntries[currentIndex + 1]!.id;
      openInspector(nextEntryId);
    }
  }, [hasNext, allEntries, currentIndex, openInspector]);

  return {
    hasPrevious,
    hasNext,
    goToPrevious,
    goToNext,
  };
}
