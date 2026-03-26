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

/** 現在のURLからsearchParamsを読み取る（Next.js useSearchParams を使わない） */
function readUrlParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/**
 * useStatsFilterSync — Zustand store ↔ URL searchParams の同期
 *
 * URL → Store: 初回マウント時に window.location.search から復元
 * Store → URL: granularity/currentDate 変更時に replaceState で URL を更新
 *
 * ⚠ Next.js の useSearchParams() は使用しない。
 *   ClientPageRouter の pushState ベースのナビゲーションと同期しないため、
 *   window.location.search を直接読み書きする。
 *
 * StatsPageContent に1箇所だけ配置する。
 */
export function useStatsFilterSync() {
  const granularity = useStatsFilterStore((s) => s.granularity);
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setGranularity = useStatsFilterStore((s) => s.setGranularity);
  const setCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  // 初回同期済みフラグ（Store→URL同期が初回URL→Store同期より先に走るのを防ぐ）
  const initializedRef = useRef(false);

  // URL → Store: 初回マウント時のみ
  useEffect(() => {
    const params = readUrlParams();
    const g = params.get('g');
    const d = params.get('d');

    if (g && isValidGranularity(g)) {
      setGranularity(g);
    }
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

    const newG = granularity;
    const newD = formatDateParam(currentDate);

    const currentParams = readUrlParams();
    if (currentParams.get('g') === newG && currentParams.get('d') === newD) return;

    currentParams.set('g', newG);
    currentParams.set('d', newD);

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}?${currentParams.toString()}`,
    );
  }, [granularity, currentDate]);
}
