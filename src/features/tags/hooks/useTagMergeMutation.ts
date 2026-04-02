// タグマージ用ミューテーションフック（楽観的更新付き）

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { trpc } from '@/platform/trpc/client';

/** タグマージフック（楽観的更新付き）。ソースタグの関連付けをターゲットに移行して削除する */
export function useMergeTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.merge.useMutation({
    onMutate: async ({ sourceTagId, targetTagId }) => {
      await utils.tags.list.cancel();
      await utils.tags.getById.cancel({ id: sourceTagId });
      await utils.tags.getById.cancel({ id: targetTagId });
      await utils.entries.getTagStats.cancel();
      await utils.entries.list.cancel();

      const previousData = utils.tags.list.getData();
      const previousSourceDetail = utils.tags.getById.getData({ id: sourceTagId });
      const previousTargetDetail = utils.tags.getById.getData({ id: targetTagId });
      const previousTagStats = utils.entries.getTagStats.getData();

      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((tag) => tag.id !== sourceTagId),
          count: old.count - 1,
        };
      });

      utils.tags.getById.setData({ id: sourceTagId }, undefined);

      return {
        previousData,
        previousSourceDetail,
        previousTargetDetail,
        previousTagStats,
        sourceTagId,
        targetTagId,
      };
    },
    onSuccess: (result) => {
      toast.success(t('merge.success', { count: result.mergedAssociations }));
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) utils.tags.list.setData(undefined, context.previousData);
      if (context?.previousSourceDetail && context?.sourceTagId) {
        utils.tags.getById.setData({ id: context.sourceTagId }, context.previousSourceDetail);
      }
      if (context?.previousTargetDetail && context?.targetTagId) {
        utils.tags.getById.setData({ id: context.targetTagId }, context.previousTargetDetail);
      }
      if (context?.previousTagStats) {
        utils.entries.getTagStats.setData(undefined, context.previousTagStats);
      }
      toast.error(t('merge.failed'));
    },
    onSettled: (_data, _err, input) => {
      void utils.tags.list.invalidate();
      void utils.tags.getById.invalidate({ id: input.sourceTagId });
      void utils.tags.getById.invalidate({ id: input.targetTagId });
      void utils.entries.list.invalidate();
      void utils.entries.getTagStats.refetch();
    },
  });
}
