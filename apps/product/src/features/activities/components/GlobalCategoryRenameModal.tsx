'use client';

import { useShellStore } from '@/lib/stores/useShellStore';

import { CategoryRenameModal } from './CategoryRenameModal';

/**
 * グローバルに配置するカテゴリーリネームモーダル
 *
 * providers.tsx で配置し、どこからでも
 * `useShellStore.use.openCategoryRenameModal(category)` で開ける。
 */
export function GlobalCategoryRenameModal() {
  const activeSheet = useShellStore.use.activeSheet();
  const closeCategoryRenameModal = useShellStore.use.closeCategoryRenameModal();

  if (activeSheet?.type !== 'categoryRename') return null;

  return (
    <CategoryRenameModal open onClose={closeCategoryRenameModal} category={activeSheet.category} />
  );
}
