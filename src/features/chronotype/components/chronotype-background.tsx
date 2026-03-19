'use client';

import { memo, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { CHRONOTYPE_LEVEL_TINT_CLASSES } from '../lib/constants';
import { getPresetChronotypeProfile, getVisibleProductivityZones } from '../lib/utils';

/** クロノタイプ背景コンポーネントのProps */
export interface ChronotypeBackgroundProps {
  startHour: number;
  endHour: number;
  hourHeight: number;
}

/** カレンダーグリッドにクロノタイプの生産性ゾーン色を背景として描画するコンポーネント */
export const ChronotypeBackground = memo<ChronotypeBackgroundProps>(function ChronotypeBackground({
  startHour,
  endHour,
  hourHeight,
}) {
  const chronotype = useCalendarSettingsStore((state) => state.chronotype);

  const profile = useMemo(() => {
    if (!chronotype.enabled) {
      return null;
    }

    return getPresetChronotypeProfile(chronotype.type);
  }, [chronotype.enabled, chronotype.type]);

  const visibleZones = useMemo(() => {
    if (!profile) {
      return [];
    }

    return getVisibleProductivityZones(profile, startHour, endHour, hourHeight);
  }, [profile, startHour, endHour, hourHeight]);

  const showBackground =
    chronotype.displayMode === 'background' || chronotype.displayMode === 'both';

  if (!profile || !showBackground || visibleZones.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      data-testid="chronotype-background"
    >
      {visibleZones.map((item, index) => (
        <div
          key={`${item.zone.level}-${item.zone.startHour}-${index}`}
          className={cn('absolute right-0 left-0', CHRONOTYPE_LEVEL_TINT_CLASSES[item.zone.level])}
          style={{
            top: `${item.top}px`,
            height: `${item.height}px`,
          }}
        />
      ))}
    </div>
  );
});
