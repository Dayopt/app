'use client';

import { useEffect } from 'react';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { StatsGranularity } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';

const VALID_GRANULARITIES = new Set<StatsGranularity>(['day', 'week', 'month', 'year']);

function isValidGranularity(value: string): value is StatsGranularity {
  return VALID_GRANULARITIES.has(value as StatsGranularity);
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function parseDateParam(value: string): Date | null {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * useStatsFilterSync — Zustand store ↔ URL searchParams の双方向同期
 *
 * URL → Store: 初回マウント時に searchParams から復元
 * Store → URL: granularity/currentDate 変更時に URL を更新（replaceState）
 *
 * StatsPageContent に1箇所だけ配置する。
 */
export function useStatsFilterSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const setCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  // URL → Store: 初回マウント時のみ
  useEffect(() => {
    const g = searchParams.get('g');
    const d = searchParams.get('d');

    if (g && isValidGranularity(g)) {
      setGranularity(g);
    }
    if (d) {
      const parsed = parseDateParam(d);
      if (parsed) setCurrentDate(parsed);
    }
    // 初回のみ実行（searchParams 変更で再実行しない）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store → URL: 状態変更時に URL を同期
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const newG = granularity;
    const newD = formatDateParam(currentDate);

    const currentG = params.get('g');
    const currentD = params.get('d');

    if (currentG === newG && currentD === newD) return;

    params.set('g', newG);
    params.set('d', newD);

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [granularity, currentDate, pathname, router, searchParams]);
}
