'use client';

import { closeModal, useModalStore } from '@/stores/useModalStore';
import { TagMergeModal } from './tag-merge-modal';

/**
 * グローバルに配置するタグマージモーダル
 *
 * providers.tsxで配置し、どこからでもopenTagMergeModal()で開ける
 */
export function GlobalTagMergeModal() {
  const modal = useModalStore((state) => state.modal);
  const isOpen = modal?.type === 'tagMerge';
  const sourceTag = isOpen ? modal.sourceTag : null;

  if (!sourceTag) return null;

  return <TagMergeModal open={isOpen} onClose={closeModal} sourceTag={sourceTag} />;
}
