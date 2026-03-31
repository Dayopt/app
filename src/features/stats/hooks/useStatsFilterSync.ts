'use client';

import { useEffect, useRef } from 'react';

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

/** 現在のURLからsearchParamsを読み取る */
function readUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/**
 * useStatsFilterSync — Zustand store ↔ URL searchParams の同期
 *
 * 管理するパラメータ:
 * - g: granularity (day/week/month/year)
 * - d: date (YYYY-MM-DD)
 *
 * タブはパスベース（/stats/review 等）なので管理しない。
 */
export function useStatsFilterSync() {
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const setCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  const initializedRef = useRef(false);

  // URL → Store: 初回マウント時のみ
  useEffect(() => {
    const params = readUrlParams();

    const g = params.get('g');
    if (g && isValidGranularity(g)) {
      setGranularity(g);
    }

    const d = params.get('d');
    if (d) {
      const parsed = parseDateParam(d);
      if (parsed) setCurrentDate(parsed);
    }

    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回マウント時のみ実行
  }, []);

  // Store → URL: ストア状態変更時に URL を同期
  useEffect(() => {
    if (!initializedRef.current) return;

    const newParams = new URLSearchParams();
    newParams.set('g', granularity);
    newParams.set('d', formatDateParam(currentDate));

    const currentSearch = window.location.search;
    const newSearch = newParams.toString();
    if (currentSearch === `?${newSearch}`) return;

    window.history.replaceState(null, '', `${window.location.pathname}?${newSearch}`);
  }, [granularity, currentDate]);
}
