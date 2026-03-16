'use client';

import { useEffect, useRef } from 'react';

import { TOUR_SCROLL_DELAY } from '../constants';

import type { BeforeEnterAction, TourStepId } from '../types';

/**
 * ステップ表示前のアクション（スクロール等）を実行するフック
 *
 * beforeEnter の discriminated union に応じて処理を分岐。
 * 完了後に onComplete を呼び出して FSM を次の状態に遷移させる。
 */
export function useBeforeEnter(
  action: BeforeEnterAction | null | undefined,
  stepId: TourStepId | undefined,
  isActive: boolean,
  onComplete: (stepId: TourStepId) => void,
): void {
  const timerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  useEffect(() => {
    if (!isActive || !action || !stepId) return;

    switch (action.type) {
      case 'scroll-to-past': {
        const gridElement = document.querySelector('[data-tour-target="grid-drag"]');
        const scrollContainer =
          gridElement?.closest('[data-scroll-container]') ?? gridElement?.parentElement;

        if (scrollContainer) {
          const now = new Date();
          const paddingHours = action.paddingHours ?? 3;
          const targetHour = Math.max(0, now.getHours() - paddingHours);
          const estimatedHourHeight = scrollContainer.scrollHeight / 24;
          const targetScroll = targetHour * estimatedHourHeight;

          scrollContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
        }

        const id = stepId;
        timerRef.current = setTimeout(() => {
          onComplete(id);
        }, TOUR_SCROLL_DELAY);
        break;
      }

      case 'scroll-to-element': {
        const el = document.querySelector(action.selector);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        const id = stepId;
        timerRef.current = setTimeout(() => {
          onComplete(id);
        }, TOUR_SCROLL_DELAY);
        break;
      }

      case 'wait-for-element': {
        const timeoutMs = action.timeoutMs ?? 3000;
        const selector = action.selector;
        const id = stepId;

        // ポーリングで要素出現を待つ
        const start = Date.now();
        const poll = () => {
          if (document.querySelector(selector)) {
            onComplete(id);
            return;
          }
          if (Date.now() - start > timeoutMs) {
            // タイムアウト時もスキップせず進行
            onComplete(id);
            return;
          }
          timerRef.current = setTimeout(poll, 100);
        };
        poll();
        break;
      }
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isActive, action, stepId, onComplete]);
}
