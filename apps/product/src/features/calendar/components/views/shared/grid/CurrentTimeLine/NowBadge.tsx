/**
 * Now Badge — deep/ease ゾーン内にいるときだけ表示するラベル
 *
 * 位置: now line の 16px 上、グリッド右端
 * 色: deep → text-chronotype-deep, ease → text-chronotype-ease
 */

'use client';

import { memo } from 'react';

import { useActiveZoneLevel } from '@/features/chronotype';
import { useTranslations } from 'next-intl';

interface NowBadgeProps {
  /** 現在時刻（分単位の精度） */
  currentHour: number;
}

export const NowBadge = memo<NowBadgeProps>(function NowBadge({ currentHour }) {
  const t = useTranslations('calendar.nowBadge');
  const zoneLevel = useActiveZoneLevel(currentHour);

  if (!zoneLevel) return null;

  const label = zoneLevel === 'deep' ? t('inDeep') : t('inEase');
  const colorClass = zoneLevel === 'deep' ? 'text-chronotype-deep' : 'text-chronotype-ease';
  const arrow = zoneLevel === 'deep' ? '↗' : '↘';

  return (
    <span
      role="status"
      aria-live="polite"
      className={`${colorClass} absolute -top-4 right-2 text-sm whitespace-nowrap`}
    >
      {arrow} {label}
    </span>
  );
});
