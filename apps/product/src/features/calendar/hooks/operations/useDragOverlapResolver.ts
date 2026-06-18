'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { useEntryMutations, useFindSkippableAutoRecords } from '@/features/entry';
import { toast } from '@/lib/toast';

/**
 * ドラッグ作成のドロップが「自動記録だけ」と衝突した時に、拒否ではなく
 * 「スキップして記録」のワンタップ解決を提示する resolver を返す。
 *
 * 返り値の callback は handled（= スキップして記録トーストを出した）なら true、
 * 対象外（確定済み実績や部分重複が混ざる）なら false を返す。呼び出し側は false の時だけ
 * 通常の重複エラーを表示する。判定ロジックは作成 mutation と共通
 * （[[skippable-auto-records]]）。
 */
export function useDragOverlapResolver() {
  const t = useTranslations();
  const { skipEntry } = useEntryMutations();
  const findSkippable = useFindSkippableAutoRecords();

  return useCallback(
    (startMs: number, endMs: number, onProceed: () => void): boolean => {
      const skippableIds = findSkippable(startMs, endMs);
      if (skippableIds.length === 0) return false;

      toast.error(t('entry.errors.timeOverlapAutoRecord'), {
        action: {
          label: t('entry.errors.skipAndRecord'),
          onClick: () => {
            void (async () => {
              try {
                for (const id of skippableIds) {
                  await skipEntry.mutateAsync({ id });
                }
                onProceed();
              } catch {
                // skip 失敗時は skipEntry.onError が toast 済み
              }
            })();
          },
        },
      });
      return true;
    },
    [t, skipEntry, findSkippable],
  );
}
