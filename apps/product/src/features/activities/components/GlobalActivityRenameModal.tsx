'use client';

import { useShellStore } from '@/lib/stores/useShellStore';

import { ActivityRenameModal } from './ActivityRenameModal';

/**
 * グローバルに配置するアクティビティリネームモーダル
 *
 * providers.tsx で配置し、どこからでも
 * `useShellStore.use.openActivityRenameModal(activity)` で開ける。
 */
export function GlobalActivityRenameModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeActivityRenameModal = useShellStore.use.closeActivityRenameModal();

  if (activeSheet?.type !== 'activityRename') return null;

  return (
    <ActivityRenameModal open onClose={closeActivityRenameModal} activity={activeSheet.activity} />
  );
}
