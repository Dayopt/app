import { api } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEntryInspectorStore } from '../../stores/useEntryInspectorStore';

export function useEntryMutationContext() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);
  const openInspector = useEntryInspectorStore((state) => state.openInspector);
  return { t, queryClient, utils, closeInspector, openInspector };
}

export type EntryMutationContext = ReturnType<typeof useEntryMutationContext>;
