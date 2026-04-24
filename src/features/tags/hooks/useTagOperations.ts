/**
 * タグ操作のビジネスロジックを管理するカスタムフック
 */

import { logger } from '@/lib/logger';
import { DEFAULT_TAG_COLOR } from '@/lib/tag-colors';
import { useCallback, useState } from 'react';
import type { CreateTagInput, Tag, UpdateTagInput } from '../types';
import { useCreateTag, useDeleteTag, useRenameTag, useUpdateTag } from './useTagCrudMutations';
import { useOptimisticTagUpdate } from './useTagsOptimistic';

/**
 * タグ操作のビジネスロジックを集約したフック
 *
 * 作成・編集・削除・リネーム・マージの各操作とモーダル状態を管理する
 * @param tags - 既存タグ一覧（楽観的更新のベースに使用）
 */
export function useTagOperations(tags: Tag[]) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
  const [mergeSourceTag, setMergeSourceTag] = useState<Tag | null>(null);

  // React Query mutations
  const createTagMutation = useCreateTag();
  const updateTagMutation = useUpdateTag();
  const deleteTagMutation = useDeleteTag();
  const renameTagMutation = useRenameTag();

  // 楽観的更新
  const { updateTagOptimistically, addTagOptimistically, removeTagOptimistically } =
    useOptimisticTagUpdate();

  // タグ作成
  const handleCreateTag = useCallback(() => {
    setShowCreateModal(true);
  }, []);

  const handleSaveNewTag = useCallback(
    async (data: CreateTagInput) => {
      try {
        // 楽観的更新
        const tempTag: Tag = {
          id: `temp-${Date.now()}`,
          name: data.name,
          user_id: 'current-user',
          color: data.color || DEFAULT_TAG_COLOR,
          icon: data.icon ?? null,
          parent_id: data.parentId ?? null,
          is_active: true,
          sort_order: tags.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        addTagOptimistically(tempTag);

        // 実際の作成
        await createTagMutation.mutateAsync({
          name: data.name,
          color: data.color,
          icon: data.icon,
          parentId: data.parentId,
        });
      } catch (error) {
        logger.error('Failed to create tag:', error);
        throw error;
      }
    },
    [createTagMutation, addTagOptimistically, tags.length],
  );

  // タグ編集
  const handleEditTag = useCallback((tag: Tag) => {
    setSelectedTag(tag);
    setShowEditModal(true);
  }, []);

  const handleSaveTag = useCallback(
    async (data: UpdateTagInput) => {
      if (!selectedTag) return;

      try {
        // 楽観的更新
        updateTagOptimistically(selectedTag.id, data as Partial<Tag>);

        // 実際の更新
        await updateTagMutation.mutateAsync({
          id: selectedTag.id,
          ...data,
        });
      } catch (error) {
        logger.error('Failed to update tag:', error);
        throw error;
      }
    },
    [selectedTag, updateTagMutation, updateTagOptimistically],
  );

  // タグ削除（確認は呼び出し元のTagDeleteDialogで実施済み）
  const handleDeleteTag = useCallback(
    async (tag: Tag) => {
      try {
        // 楽観的更新
        removeTagOptimistically(tag.id);

        // 実際の削除
        await deleteTagMutation.mutateAsync({ id: tag.id });
      } catch (error) {
        logger.error('Failed to delete tag:', error);
        throw error;
      }
    },
    [deleteTagMutation, removeTagOptimistically],
  );

  // タグリネーム
  const handleRenameTag = useCallback(
    async (tag: Tag, newName: string) => {
      try {
        // 楽観的更新
        updateTagOptimistically(tag.id, { name: newName });

        // 実際のリネーム
        await renameTagMutation.mutateAsync({
          id: tag.id,
          name: newName,
        });
      } catch (error) {
        logger.error('Failed to rename tag:', error);
        throw error;
      }
    },
    [renameTagMutation, updateTagOptimistically],
  );

  // タグマージ
  const handleMergeTag = useCallback((tag: Tag) => {
    setMergeSourceTag(tag);
    setShowMergeModal(true);
  }, []);

  // マージモーダルを閉じる
  const handleCloseMergeModal = useCallback(() => {
    setShowMergeModal(false);
    setMergeSourceTag(null);
  }, []);

  // モーダルを閉じる
  const handleCloseModals = useCallback(() => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setShowMergeModal(false);
    setSelectedTag(null);
    setMergeSourceTag(null);
  }, []);

  return {
    // State
    showCreateModal,
    showEditModal,
    showMergeModal,
    selectedTag,
    mergeSourceTag,

    // Handlers
    handleCreateTag,
    handleSaveNewTag,
    handleEditTag,
    handleSaveTag,
    handleDeleteTag,
    handleRenameTag,
    handleMergeTag,
    handleCloseMergeModal,
    handleCloseModals,
  };
}
