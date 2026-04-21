/**
 * Chronotype gradient の CSS 文字列を返すフック
 *
 * DB に保存済みの gradient があればそれを使い、
 * なければクライアント側でフォールバック生成する。
 */

import { useMemo } from 'react';

import { generateChronotypeGradient, getChronotypeProfile } from '@/features/chronotype';
import { useTheme } from '@/lib/hooks/useTheme';
import { useCalendarSettingsStore } from '@/lib/stores/useCalendarSettingsStore';

export function useChronotypeGradient(): string | null {
  const chronotype = useCalendarSettingsStore((s) => s.chronotype);
  const chronotypeGradient = useCalendarSettingsStore((s) => s.chronotypeGradient);
  const { resolvedTheme } = useTheme();

  return useMemo(() => {
    if (!chronotype) return null;
    const mode = resolvedTheme === 'dark' ? 'dark' : ('light' as const);

    // DB に保存済みの gradient があればそれを使う
    const stored = mode === 'dark' ? chronotypeGradient.dark : chronotypeGradient.light;
    if (stored) return stored;

    // フォールバック: クライアント側で生成
    const profile = getChronotypeProfile(chronotype.type);
    return generateChronotypeGradient(profile.productivityZones, mode);
  }, [chronotype, chronotypeGradient, resolvedTheme]);
}
