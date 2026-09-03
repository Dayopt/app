'use client';

import { useTranslations } from 'next-intl';

import { SegmentedControl } from '@dayopt/components';

import type { ReportGranularity } from '../../lib/report-period';

interface ReportGranularitySwitcherProps {
  value: ReportGranularity;
  onValueChange: (value: ReportGranularity) => void;
  className?: string | undefined;
}

/**
 * 週｜月｜年 の粒度切替。
 *
 * カレンダーのビュー切替は選択肢が 1〜7 日 + 各種トグルを抱えるため `DropdownMenu` だが、
 * レポートは 3 つで固定なのでセグメントで出す（1 タップで切り替わる）。
 */
export function ReportGranularitySwitcher({
  value,
  onValueChange,
  className,
}: ReportGranularitySwitcherProps) {
  const t = useTranslations('report.granularity');

  return (
    <SegmentedControl
      value={value}
      onValueChange={onValueChange}
      options={[
        { value: 'week', label: t('week') },
        { value: 'month', label: t('month') },
        { value: 'year', label: t('year') },
      ]}
      ariaLabel={t('ariaLabel')}
      size="sm"
      {...(className ? { className } : {})}
    />
  );
}
