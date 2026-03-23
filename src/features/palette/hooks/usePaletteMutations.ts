'use client';

/**
 * パレットの楽観的更新付き mutation hooks
 *
 * pin（追加）/ unpin（削除）を即座にUIに反映し、
 * エラー時はロールバック、完了時にキャッシュを再検証する。
 */

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { api } from '@/platform/trpc';

type PinnedItem = {
  id: string;
  tag_id: string;
  duration_minutes: number;
  sort_order: number;
  is_pinned: boolean;
};

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
        const tempItem: PinnedItem = {
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
      void utils.history.getRecentBlocks.invalidate();
    },
  });

  const pinItem = useCallback(
    (tagId: string, durationMinutes: number) => {
      pinMutation.mutate({ tagId, durationMinutes });
    },
    [pinMutation],
  );

  const unpinItem = useCallback(
    (id: string) => {
      unpinMutation.mutate({ id });
    },
    [unpinMutation],
  );

  return {
    pinItem,
    unpinItem,
    isPinning: pinMutation.isPending,
  };
}
