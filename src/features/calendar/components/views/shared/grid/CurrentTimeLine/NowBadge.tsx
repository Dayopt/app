/**
 * Now Badge — deep/ease ゾーン内にいるときだけ表示するラベル
 *
 * 位置: now line の 16px 上、グリッド右端
 * 色: deep → text-chronotype-deep, ease → text-chronotype-ease
 */

'use client';

import { memo, useMemo } from 'react';

import { getActiveZoneLevel, getChronotypeProfile } from '@/features/chronotype';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';
import { useTranslations } from 'next-intl';

interface NowBadgeProps {
  /** 現在時刻（分単位の精度） */
  currentHour: number;
}

export const NowBadge = memo<NowBadgeProps>(function NowBadge({ currentHour }) {
  const t = useTranslations('calendar.nowBadge');
  const chronotype = useCalendarSettingsStore((s) => s.chronotype);

  const zoneLevel = useMemo(() => {
    if (!chronotype) return null;
    const profile = getChronotypeProfile(chronotype.type);
    return getActiveZoneLevel(profile.productivityZones, currentHour);
  }, [chronotype, currentHour]);

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
