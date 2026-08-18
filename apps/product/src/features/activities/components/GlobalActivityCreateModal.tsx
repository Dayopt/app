'use client';

import { useShellStore } from '@/lib/stores/useShellStore';

import { ActivityCreateModal } from './ActivityCreateModal';

/**
 * グローバルに配置するアクティビティ新規作成モーダル
 *
 * providers.tsx で配置し、どこからでも
 * `useShellStore.use.openActivityCreateModal()` で開ける。
 */
export function GlobalActivityCreateModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeActivityCreateModal = useShellStore.use.closeActivityCreateModal();

  if (activeSheet?.type !== 'activityCreate') return null;

  return (
    <ActivityCreateModal
      open
      onClose={closeActivityCreateModal}
      initialCategoryId={activeSheet.context.initialCategoryId}
      {...(activeSheet.context.onCreated ? { onCreated: activeSheet.context.onCreated } : {})}
    />
  );
}
