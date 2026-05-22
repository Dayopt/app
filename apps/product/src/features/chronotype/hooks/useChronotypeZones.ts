/**
 * Chronotype の productivityZones を返すフック
 *
 * chronotype が無効な場合は undefined を返す。consumer は zones 配列を
 * そのまま render（例: TimeColumn のラベル装飾用）に使う想定。
 */

import { useMemo } from 'react';

import type { ProductivityZone } from '@/lib/types/chronotype';

import { getChronotypeProfile } from '../lib/chronotype-profile';
import { useChronotypeSettingsStore } from '../stores/useChronotypeSettingsStore';

export function useChronotypeZones(): ProductivityZone[] | undefined {
  const chronotype = useChronotypeSettingsStore((s) => s.chronotype);
  return useMemo(() => {
    if (!chronotype) return undefined;
    return getChronotypeProfile(chronotype.type).productivityZones;
  }, [chronotype]);
}
