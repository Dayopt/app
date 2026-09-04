'use client';

import { useTranslations } from 'next-intl';

import type { ReportWaitingActivity } from '../../../domain/report/report-view-model';

interface WaitingListProps {
  /** 記録はあるが充実の回答がまだ足りない行。記録の降順。 */
  activities: readonly ReportWaitingActivity[];
}

/**
 * 点になるのを待っているアクティビティ（仕様 §4.3）。
 *
 * 名前を並べるだけで、催促はしない（「〜しましょう」を書かない）。
 */
export function WaitingList({ activities }: WaitingListProps) {
  const t = useTranslations('report.quality');

  if (activities.length === 0) return null;

  // 区切りは言語ごとに違う（ja は読点、en はカンマ）。コードに直書きしない
  const names = activities
    .map((activity) => activity.name ?? t('unnamed'))
    .join(t('waitingSeparator'));

  return (
    <p data-report-list="waiting" className="text-muted-foreground text-xs">
      {t('waiting', { names })}
    </p>
  );
}
