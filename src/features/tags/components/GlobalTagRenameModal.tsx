'use client';

import { useShellStore } from '@/lib/stores/useShellStore';

import { TagRenameModal } from './tag-rename-modal';

/**
 * グローバルに配置するタグリネームモーダル
 *
 * providers.tsx で配置し、どこからでも
 * `useTagModalNavigation().openTagRenameModal(tag)` で開ける。
 */
export function GlobalTagRenameModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeTagRenameModal = useShellStore.use.closeTagRenameModal();

  if (activeSheet?.type !== 'tagRename') return null;

  return <TagRenameModal open onClose={closeTagRenameModal} tag={activeSheet.tag} />;
}
