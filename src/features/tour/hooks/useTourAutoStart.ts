'use client';

import { useEffect } from 'react';

import { TOUR_START_DELAY } from '../constants';
import { useTourStore } from '../stores/useTourStore';

/**
 * カレンダーページでツアーを自動開始するフック
 *
 * @param enabled - true の場合のみ自動開始（カレンダーページ && 未完了）
 */
export function useTourAutoStart(enabled: boolean): void {
  const send = useTourStore.use.send();

  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(() => {
      send({ type: 'START' });
    }, TOUR_START_DELAY);

    return () => clearTimeout(timer);
  }, [enabled, send]);
}
