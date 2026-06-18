'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { useFindSkippableAutoRecords } from '@/features/entry';
import { toast } from '@/lib/toast';

/**
 * ドラッグ作成のドロップが「自動記録だけ」と衝突した時に、拒否ではなく
 * 「スキップして記録」のワンタップ解決を提示する resolver を返す。
 *
 * 返り値の callback は handled（= スキップして記録トーストを出した）なら true、
 * 対象外（確定済み実績や部分重複が混ざる）なら false を返す。呼び出し側は false の時だけ
 * 通常の重複エラーを表示する。
 *
 * 実際のスキップはここでは行わない。「スキップして記録」を押すと作成フロー（タグパレット）へ
 * id を渡し、記録の作成が確定する時にだけスキップする。パレットを閉じてキャンセルした場合は
 * 何も変更しないため、「記録は作られていないのに自動記録だけ消える」状態を作らない。
 * 判定ロジックは作成 mutation と共通（[[skippable-auto-records]]）。
 */
export function useDragOverlapResolver() {
  const t = useTranslations();
  const findSkippable = useFindSkippableAutoRecords();

  return useCallback(
    (startMs: number, endMs: number, onProceed: (skipEntryIds: string[]) => void): boolean => {
      const skippableIds = findSkippable(startMs, endMs);
      if (skippableIds.length === 0) return false;

      toast.error(t('entry.errors.timeOverlapAutoRecord'), {
        action: {
          label: t('entry.errors.skipAndRecord'),
          onClick: () => onProceed(skippableIds),
        },
      });
      return true;
    },
    [t, findSkippable],
  );
}
