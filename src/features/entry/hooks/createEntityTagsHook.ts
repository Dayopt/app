/**
 * Entity Tags Hook Factory
 *
 * Plan用のタグ管理フックを生成
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';
import { useUpdateEntityTagsInCache } from './useUpdateEntityTagsInCache';

/** tRPC utils 型 */
type TRPCUtils = ReturnType<typeof api.useUtils>;

/**
 * エンティティタグフックファクトリーのオプション
 */
export interface CreateEntityTagsHookOptions {
  /** エンティティ名 */
  entityName: 'entries';
  /** エンティティIDフィールド名 */
  entityIdField: 'entryId';
  /** TagStats更新を有効化 */
  enableTagStats?: boolean;
}

/**
 * エンティティタグフック
 */
export interface EntityTagsHook {
  isLoading: boolean;
  error: string | null;
  addTag: (entityId: string, tagId: string) => Promise<boolean>;
  removeTag: (entityId: string, tagId: string) => Promise<boolean>;
  setTags: (entityId: string, tagId: string | null) => Promise<boolean>;
}

/**
 * エンティティタグフックファクトリー
 *
 * @param options フック設定
 * @param utils tRPC API utils (api.useUtils()の結果)
 * @returns エンティティタグフック
 *
 * @example
 * ```typescript
 * export function usePlanTags() {
 *   const utils = api.useUtils();
 *   return useEntityTagsHook({
 *     entityName: 'plans',
 *     entityIdField: 'planId',
 *     enableTagStats: true,
 *   }, utils);
 * }
 * ```
 */
export function useEntityTagsHook(
  options: CreateEntityTagsHookOptions,
  utils: TRPCUtils,
): EntityTagsHook {
  const { entityName, enableTagStats = false } = options;
  const t = useTranslations();
  const queryClient = useQueryClient();
  const updateEntityTagIdsInCache = useUpdateEntityTagsInCache(entityName);

  // 現在のエンティティのタグIDリストを取得するヘルパー
  const getCurrentEntityTagIds = useCallback(
    (entityId: string): string[] => {
      // まず getById から取得を試みる
      const entityData = utils[entityName].getById.getData({ id: entityId }) as
        | { tagIds?: string[] }
        | null
        | undefined;
      if (entityData?.tagIds) {
        return entityData.tagIds;
      }

      // list から取得を試みる
      const allQueries = queryClient.getQueriesData<Array<{ id: string; tagIds?: string[] }>>({
        predicate: (query) => {
          const key = query.queryKey;
          return (
            Array.isArray(key) &&
            key.length >= 1 &&
            Array.isArray(key[0]) &&
            key[0][0] === entityName &&
            key[0][1] === 'list'
          );
        },
      });

      for (const [, data] of allQueries) {
        if (data) {
          const entity = data.find((e) => e.id === entityId);
          if (entity?.tagIds) {
            return entity.tagIds;
          }
        }
      }

      return [];
    },
    [queryClient, utils, entityName],
  );

  // addTag mutation
  const addTagMutation = api[entityName].addTag.useMutation({
    onMutate: async (variables) => {
      const entityId = variables.entryId;
      const { tagId } = variables;

      await utils[entityName].list.cancel();
      await utils[entityName].getById.cancel({ id: entityId });
      if (enableTagStats) {
        await utils.entries.getTagStats.cancel();
      }

      const previousListData = utils[entityName].list.getData();
      const previousEntityData = utils[entityName].getById.getData({ id: entityId });
      const previousTagStats = enableTagStats ? utils.entries.getTagStats.getData() : undefined;

      const currentTagIds = getCurrentEntityTagIds(entityId);
      if (!currentTagIds.includes(tagId)) {
        updateEntityTagIdsInCache(entityId, [...currentTagIds, tagId]);

        if (enableTagStats && previousTagStats) {
          const newCounts = { ...previousTagStats.counts };
          newCounts[tagId] = (newCounts[tagId] ?? 0) + 1;
          utils.entries.getTagStats.setData(undefined, {
            ...previousTagStats,
            counts: newCounts,
          });
        }
      }

      return { previousListData, previousEntityData, previousTagStats, entityId };
    },
    onError: (_err, variables, context) => {
      const entityId = variables.entryId;
      if (context?.previousListData) {
        utils[entityName].list.setData(undefined, context.previousListData as never);
      }
      if (context?.previousEntityData) {
        utils[entityName].getById.setData({ id: entityId }, context.previousEntityData as never);
      }
      if (enableTagStats && context?.previousTagStats) {
        utils.entries.getTagStats.setData(undefined, context.previousTagStats);
      }
    },
    onSettled: (_data, _err, variables) => {
      const entityId = variables.entryId;
      void utils[entityName].getById.invalidate({ id: entityId });
      void utils[entityName].list.invalidate();
      if (enableTagStats) {
        void utils.entries.getTagStats.invalidate();
      }
    },
  });

  // removeTag mutation
  const removeTagMutation = api[entityName].removeTag.useMutation({
    onMutate: async (variables) => {
      const entityId = variables.entryId;
      const { tagId } = variables;

      await utils[entityName].list.cancel();
      await utils[entityName].getById.cancel({ id: entityId });
      if (enableTagStats) {
        await utils.entries.getTagStats.cancel();
      }

      const previousListData = utils[entityName].list.getData();
      const previousEntityData = utils[entityName].getById.getData({ id: entityId });
      const previousTagStats = enableTagStats ? utils.entries.getTagStats.getData() : undefined;

      const currentTagIds = getCurrentEntityTagIds(entityId);
      const newTagIds = currentTagIds.filter((id) => id !== tagId);
      updateEntityTagIdsInCache(entityId, newTagIds);

      if (enableTagStats && previousTagStats) {
        const newCounts = { ...previousTagStats.counts };
        if (newCounts[tagId] !== undefined && newCounts[tagId] > 0) {
          newCounts[tagId] = newCounts[tagId] - 1;
        }
        utils.entries.getTagStats.setData(undefined, {
          ...previousTagStats,
          counts: newCounts,
        });
      }

      return { previousListData, previousEntityData, previousTagStats, entityId };
    },
    onError: (_err, variables, context) => {
      const entityId = variables.entryId;
      if (context?.previousListData) {
        utils[entityName].list.setData(undefined, context.previousListData as never);
      }
      if (context?.previousEntityData) {
        utils[entityName].getById.setData({ id: entityId }, context.previousEntityData as never);
      }
      if (enableTagStats && context?.previousTagStats) {
        utils.entries.getTagStats.setData(undefined, context.previousTagStats);
      }
    },
    onSettled: (_data, _err, variables) => {
      const entityId = variables.entryId;
      void utils[entityName].getById.invalidate({ id: entityId });
      void utils[entityName].list.invalidate();
      if (enableTagStats) {
        void utils.entries.getTagStats.invalidate();
      }
    },
  });

  // setTags mutation（1エントリ1タグ: tagId: string | null）
  const setTagsMutation = api[entityName].setTags.useMutation({
    onMutate: async (variables) => {
      const entityId = variables.entryId;
      const { tagId } = variables;

      await utils[entityName].list.cancel();
      await utils[entityName].getById.cancel({ id: entityId });
      if (enableTagStats) {
        await utils.entries.getTagStats.cancel();
      }

      const previousListData = utils[entityName].list.getData();
      const previousEntityData = utils[entityName].getById.getData({ id: entityId });
      const previousTagStats = enableTagStats ? utils.entries.getTagStats.getData() : undefined;

      const currentTagIds = getCurrentEntityTagIds(entityId);
      const newTagIds = tagId ? [tagId] : [];
      updateEntityTagIdsInCache(entityId, newTagIds);

      if (enableTagStats && previousTagStats) {
        const oldTagId = currentTagIds[0] ?? null;
        const newCounts = { ...previousTagStats.counts };
        if (
          oldTagId &&
          oldTagId !== tagId &&
          newCounts[oldTagId] !== undefined &&
          newCounts[oldTagId] > 0
        ) {
          newCounts[oldTagId] = newCounts[oldTagId] - 1;
        }
        if (tagId && tagId !== oldTagId) {
          newCounts[tagId] = (newCounts[tagId] ?? 0) + 1;
        }
        utils.entries.getTagStats.setData(undefined, {
          ...previousTagStats,
          counts: newCounts,
        });
      }

      return { previousListData, previousEntityData, previousTagStats, entityId };
    },
    onError: (_err, variables, context) => {
      const entityId = variables.entryId;
      if (context?.previousListData) {
        utils[entityName].list.setData(undefined, context.previousListData as never);
      }
      if (context?.previousEntityData) {
        utils[entityName].getById.setData({ id: entityId }, context.previousEntityData as never);
      }
      if (enableTagStats && context?.previousTagStats) {
        utils.entries.getTagStats.setData(undefined, context.previousTagStats);
      }
    },
    onSettled: (_data, _err, variables) => {
      const entityId = variables.entryId;
      void utils[entityName].getById.invalidate({ id: entityId });
      void utils[entityName].list.invalidate();
      if (enableTagStats) {
        void utils.entries.getTagStats.invalidate();
      }
    },
  });

  // Public API
  const addTag = useCallback(
    async (entityId: string, tagId: string): Promise<boolean> => {
      try {
        await addTagMutation.mutateAsync({ entryId: entityId, tagId });
        return true;
      } catch (error) {
        logger.error('Failed to add tag:', error);
        toast.error(t('entry.toast.updateFailed'));
        return false;
      }
    },
    [addTagMutation, t],
  );

  const removeTag = useCallback(
    async (entityId: string, tagId: string): Promise<boolean> => {
      try {
        await removeTagMutation.mutateAsync({ entryId: entityId, tagId });
        return true;
      } catch (error) {
        logger.error('Failed to remove tag:', error);
        toast.error(t('entry.toast.updateFailed'));
        return false;
      }
    },
    [removeTagMutation, t],
  );

  const setTags = useCallback(
    async (entityId: string, tagId: string | null): Promise<boolean> => {
      try {
        await setTagsMutation.mutateAsync({ entryId: entityId, tagId });
        return true;
      } catch (error) {
        logger.error('Failed to set tags:', error);
        toast.error(t('entry.toast.updateFailed'));
        return false;
      }
    },
    [setTagsMutation, t],
  );

  const isLoading =
    addTagMutation.isPending || removeTagMutation.isPending || setTagsMutation.isPending;

  const error =
    addTagMutation.error?.message ??
    removeTagMutation.error?.message ??
    setTagsMutation.error?.message ??
    null;

  return {
    isLoading,
    error,
    addTag,
    removeTag,
    setTags,
  };
}
