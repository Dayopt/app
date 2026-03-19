'use client';

import { closeModal as closeModalAction, useModalStore } from '@/stores/useModalStore';
import { useCreateTag, useTags } from '../hooks';
import { TagCreateModal } from './tag-create-modal';

import type { CreateTagInput } from '../types';

/**
 * グローバルに配置するタグ作成モーダル
 *
 * providers.tsxで配置し、どこからでもopenTagCreateModal()で開ける
 */
export function GlobalTagCreateModal() {
  const modal = useModalStore((state) => state.modal);
  const isOpen = modal?.type === 'tagCreate';
  const defaultGroup = isOpen ? modal.defaultGroup : undefined;
  const handleClose = closeModalAction;
  const createTagMutation = useCreateTag();
  const { data: existingTags } = useTags();

  // 楽観的更新: mutateを使用（awaitしない）→ モーダルは即座に閉じる
  // ただし重複チェックはクライアント側で先に行い、エラーはモーダル内で表示
  const handleCreateTag = async (data: CreateTagInput) => {
    // クライアント側で重複チェック（大文字小文字を区別しない）
    const isDuplicate = existingTags?.some(
      (tag) => tag.name.toLowerCase() === data.name.trim().toLowerCase(),
    );
    if (isDuplicate) {
      throw new Error('duplicate');
    }

    // 重複なし → mutateで楽観的更新（awaitしない）
    createTagMutation.mutate({
      name: data.name,
      color: data.color,
    });
  };

  return (
    <TagCreateModal
      isOpen={isOpen}
      onClose={handleClose}
      onSave={handleCreateTag}
      defaultGroup={defaultGroup}
      existingTags={existingTags ?? []}
    />
  );
}
