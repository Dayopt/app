'use client';

import { useEffect, useRef } from 'react';

import type { StatsGranularity, StatsTab } from '../stores/useStatsFilterStore';
import { useStatsFilterStore } from '../stores/useStatsFilterStore';

const VALID_GRANULARITIES = new Set<StatsGranularity>(['day', 'week', 'month', 'year']);
const VALID_TABS = new Set<StatsTab>(['review', 'progress', 'insights']);

function isValidGranularity(value: string): value is StatsGranularity {
  return VALID_GRANULARITIES.has(value as StatsGranularity);
}

function isValidTab(value: string): value is StatsTab {
  return VALID_TABS.has(value as StatsTab);
}

function formatDateParam(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

function parseDateParam(value: string): Date | null {
  const parsed = new Date(value + 'T00:00:00');
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** 現在のURLからsearchParamsを読み取る（Next.js useSearchParams を使わない） */
function readUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/**
 * useStatsFilterSync — Zustand store ↔ URL searchParams の同期
 *
 * URL → Store: 初回マウント時に window.location.search から復元
 * Store → URL: tab/granularity/currentDate 変更時に replaceState で URL を更新
 *
 * 管理するパラメータ:
 * - tab: review | progress | insights
 * - g: granularity (day/week/month/year)
 * - d: date (YYYY-MM-DD)
 */
export function useStatsFilterSync() {
  const tab = useStatsFilterStore((s) => s.tab);
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setTab = useStatsFilterStore((s) => s.setTab);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const setCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  // 初回同期済みフラグ（Store→URL同期が初回URL→Store同期より先に走るのを防ぐ）
  const initializedRef = useRef(false);

  // URL → Store: 初回マウント時のみ
  useEffect(() => {
    const params = readUrlParams();

    const urlTab = params.get('tab');
    if (urlTab && isValidTab(urlTab)) {
      setTab(urlTab);
    }

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

    // tab はデフォルト(review)以外のときだけ付与
    if (tab !== 'review') {
      newParams.set('tab', tab);
    }

    newParams.set('g', granularity);
    newParams.set('d', formatDateParam(currentDate));

    const currentSearch = window.location.search;
    const newSearch = newParams.toString();
    if (currentSearch === `?${newSearch}`) return;

    window.history.replaceState(null, '', `${window.location.pathname}?${newSearch}`);
  }, [tab, granularity, currentDate]);
}
