'use client';

import { useShellStore } from '@/lib/stores/useShellStore';

import { TagCreateModal } from './tag-create-modal';

/**
 * グローバルに配置するタグ新規作成モーダル
 *
 * providers.tsx で配置し、どこからでも
 * `useShellStore.use.openTagCreateModal()` で開ける。
 */
export function GlobalTagCreateModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeTagCreateModal = useShellStore.use.closeTagCreateModal();

  if (activeSheet?.type !== 'tagCreate') return null;

  return (
    <TagCreateModal
      open
      onClose={closeTagCreateModal}
      initialParentId={activeSheet.context.initialParentId}
      {...(activeSheet.context.onCreated ? { onCreated: activeSheet.context.onCreated } : {})}
    />
  );
}
