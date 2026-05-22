/**
 * 指定時刻が現在の chronotype の deep/ease ゾーン内かどうかを返すフック
 *
 * chronotype が無効、もしくは時刻がゾーン外の場合は null を返す。
 * consumer は null チェックで badge 表示等の有無を判定する。
 */

import { useMemo } from 'react';

import { getChronotypeProfile } from '../lib/chronotype-profile';
import { getActiveZoneLevel } from '../lib/gradient';
import { useChronotypeSettingsStore } from '../stores/useChronotypeSettingsStore';

export function useActiveZoneLevel(hour: number): 'deep' | 'ease' | null {
  const chronotype = useChronotypeSettingsStore((s) => s.chronotype);
  return useMemo(() => {
    if (!chronotype) return null;
    const profile = getChronotypeProfile(chronotype.type);
    return getActiveZoneLevel(profile.productivityZones, hour);
  }, [chronotype, hour]);
}
