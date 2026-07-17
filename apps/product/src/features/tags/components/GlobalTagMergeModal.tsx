'use client';

import { useShellStore } from '@/lib/stores/useShellStore';
import { TagMergeModal } from './TagMergeModal';

/**
 * グローバルに配置するタグマージモーダル
 *
 * providers.tsx で配置し、どこからでも useShellStore.openTagMergeModal() で開ける。
 * P2-2 で旧 useModalStore から useShellStore に統合。
 */
export function GlobalTagMergeModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeTagMergeModal = useShellStore.use.closeTagMergeModal();

  if (activeSheet?.type !== 'tagMerge') return null;

  return <TagMergeModal open onClose={closeTagMergeModal} sourceTag={activeSheet.sourceTag} />;
}
