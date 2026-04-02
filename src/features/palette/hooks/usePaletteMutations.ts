'use client';

/**
 * パレットの楽観的更新付き mutation hooks
 *
 * pin（追加）/ unpin（削除）/ updateDuration（時間変更）を即座にUIに反映し、
 * エラー時はロールバック、完了時にキャッシュを再検証する。
 */

import { useCallback } from 'react';

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { api } from '@/platform/trpc';

import type { PaletteItem } from './usePaletteQuery';

/** パレットの pin / unpin mutation（楽観的更新付き） */
export function usePaletteMutations() {
  const utils = api.useUtils();
  const t = useTranslations();

  const pinMutation = api.palette.pin.useMutation({
    onMutate: async (input) => {
      await utils.palette.list.cancel();

      const previous = utils.palette.list.getData();

      utils.palette.list.setData(undefined, (old) => {
        if (!old) return old;
        const maxOrder = old.reduce((max, item) => Math.max(max, item.sort_order), -1);
        const tempItem: PaletteItem = {
          id: `temp-${Date.now()}`,
          tag_id: input.tagId,
          duration_minutes: input.durationMinutes,
          sort_order: maxOrder + 1,
          is_pinned: true,
        };
        return [...old, tempItem];
      });

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.palette.list.setData(undefined, context.previous);
      }
      toast.error(t('sidebar.palette.pinFailed'));
    },

    onSettled: () => {
      void utils.palette.list.invalidate();
      // ピン状態変更は RecentBlocks のスコアリング（ピン済みを除外）に影響するため、履歴キャッシュも無効化する
      void utils.history.getRecentBlocks.invalidate();
    },
  });

  const unpinMutation = api.palette.unpin.useMutation({
    onMutate: async (input) => {
      await utils.palette.list.cancel();

      const previous = utils.palette.list.getData();

      utils.palette.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.filter((item) => item.id !== input.id);
      });

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.palette.list.setData(undefined, context.previous);
      }
      toast.error(t('sidebar.palette.unpinFailed'));
    },

    onSettled: () => {
      void utils.palette.list.invalidate();
      // ピン解除は RecentBlocks のスコアリング（ピン済みを除外）に影響するため、履歴キャッシュも無効化する
      void utils.history.getRecentBlocks.invalidate();
    },
  });

  const updateDurationMutation = api.palette.updateDuration.useMutation({
    onMutate: async (input) => {
      await utils.palette.list.cancel();

      const previous = utils.palette.list.getData();

      utils.palette.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((item) =>
          item.id === input.id ? { ...item, duration_minutes: input.durationMinutes } : item,
        );
      });

      return { previous };
    },

    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.palette.list.setData(undefined, context.previous);
      }
      toast.error(t('sidebar.palette.updateFailed'));
    },

    onSettled: () => {
      void utils.palette.list.invalidate();
    },
  });

  const pinItem = useCallback(
    (
      tagId: string,
      durationMinutes: number,
      callbacks?: { onSuccess?: () => void; onError?: () => void },
    ) => {
      pinMutation.mutate(
        { tagId, durationMinutes },
        {
          ...(callbacks?.onSuccess ? { onSuccess: callbacks.onSuccess } : {}),
          ...(callbacks?.onError ? { onError: callbacks.onError } : {}),
        },
      );
    },
    [pinMutation],
  );

  const unpinItem = useCallback(
    (id: string) => {
      unpinMutation.mutate({ id });
    },
    [unpinMutation],
  );

  const updateDuration = useCallback(
    (id: string, durationMinutes: number) => {
      updateDurationMutation.mutate({ id, durationMinutes });
    },
    [updateDurationMutation],
  );

  return {
    pinItem,
    unpinItem,
    updateDuration,
    isPinning: pinMutation.isPending,
    isUnpinning: unpinMutation.isPending,
    isUpdatingDuration: updateDurationMutation.isPending,
  };
}
