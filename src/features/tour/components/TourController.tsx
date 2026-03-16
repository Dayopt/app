'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePathname } from '@/platform/i18n/navigation';

import { TOUR_MIN_PAST_HOURS, TOUR_SCROLL_DELAY, TOUR_START_DELAY, TOUR_STEPS } from '../constants';
import { useTourStore } from '../stores/useTourStore';
import { TourBackdrop } from './TourBackdrop';
import { TourDoneCard } from './TourDoneCard';
import { TourStep } from './TourStep';

import type { TourStepId } from '../types';

/** ステップバリデーター: false を返すと自動進行しない */
export type TourStepValidators = Partial<Record<TourStepId, () => boolean>>;

interface TourControllerProps {
  /** 自動進行時のバリデーション関数（composition層から注入） */
  stepValidators?: TourStepValidators;
  /** バリデーション失敗時のコールバック（トースト表示等） */
  onValidationFail?: (stepId: TourStepId) => void;
}

/**
 * ツアーオーケストレータ
 *
 * GlobalOverlays にマウントし、カレンダーページでのみツアーを表示。
 * 初回訪問時に自動開始、完了/スキップ後は再表示しない。
 * autoAdvance ステップは MutationObserver で自動進行。
 * beforeEnter でスクロール等の前処理を実行。
 */
export function TourController({ stepValidators, onValidationFail }: TourControllerProps) {
  const pathname = usePathname();

  const isActive = useTourStore.use.isActive();
  const completed = useTourStore.use.completed();
  const currentStepIndex = useTourStore.use.currentStepIndex();
  const startTour = useTourStore.use.startTour();
  const skipTour = useTourStore.use.skipTour();
  const completeTour = useTourStore.use.completeTour();

  const isCalendarPage = pathname.startsWith('/calendar');

  // beforeEnter: スクロール完了済みのステップIDを記録
  const [beforeEnterReadyId, setBeforeEnterReadyId] = useState<TourStepId | null>(null);
  const beforeEnterTimerRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // ランタイムスキップ: skipWhen 条件を評価してアクティブステップを算出
  const activeSteps = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();

    return TOUR_STEPS.filter((step) => {
      if (step.skipWhen === 'no-past-time' && currentHour < TOUR_MIN_PAST_HOURS) {
        return false;
      }
      return true;
    });
  }, []);

  // カレンダーページのみで自動開始
  useEffect(() => {
    if (!isCalendarPage || completed) return;

    const timer = setTimeout(() => {
      startTour();
    }, TOUR_START_DELAY);

    return () => clearTimeout(timer);
  }, [isCalendarPage, completed, startTour]);

  // 最終ステップの「次へ」→ done カードへ（isActive 維持、index を範囲外に）
  const handleNext = useCallback(() => {
    const nextIndex = currentStepIndex + 1;
    useTourStore.setState({ currentStepIndex: nextIndex });
  }, [currentStepIndex]);

  // beforeEnter 処理: スクロール等の前処理を実行し、完了後に ready フラグを立てる
  const currentStep = activeSteps[currentStepIndex];
  const needsBeforeEnter = currentStep?.beforeEnter === 'scroll-to-past';
  const isBeforeEnterPending = needsBeforeEnter && beforeEnterReadyId !== currentStep?.id;

  useEffect(() => {
    if (!isActive || !currentStep?.beforeEnter) return;
    if (beforeEnterReadyId === currentStep.id) return;

    if (currentStep.beforeEnter === 'scroll-to-past') {
      // グリッドのスクロールコンテナを取得して過去の時間帯にスクロール
      const gridElement = document.querySelector('[data-tour-target="grid-drag"]');
      const scrollContainer =
        gridElement?.closest('[data-scroll-container]') ?? gridElement?.parentElement;

      if (scrollContainer) {
        const now = new Date();
        const targetHour = Math.max(0, now.getHours() - 3);
        // hourHeight はコンテナの scrollHeight / 24 で推定
        const estimatedHourHeight = scrollContainer.scrollHeight / 24;
        const targetScroll = targetHour * estimatedHourHeight;

        scrollContainer.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }

      const stepId = currentStep.id;
      // スクロール完了を待ってからステップを表示
      beforeEnterTimerRef.current = setTimeout(() => {
        setBeforeEnterReadyId(stepId);
      }, TOUR_SCROLL_DELAY);
    }

    return () => {
      if (beforeEnterTimerRef.current) {
        clearTimeout(beforeEnterTimerRef.current);
      }
    };
  }, [isActive, currentStep, beforeEnterReadyId]);

  // MutationObserver: autoAdvance ステップで新規追加ノードのみ監視して自動進行
  useEffect(() => {
    if (!isActive || !currentStep?.autoAdvance || !currentStep.observeSelector) return;

    // ★ 既存カードは無視（リプレイ時のスキップ防止）
    // addedNodes のみチェックし、DOM に既にある要素では進行しない
    const target = document.querySelector(currentStep.targetSelector);
    if (!target) return;

    const selector = currentStep.observeSelector;
    const stepId = currentStep.id;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          if (node.matches(selector) || node.querySelector(selector)) {
            // バリデーション: 失敗時は進行しない（observerは維持）
            const validator = stepValidators?.[stepId];
            if (validator && !validator()) {
              onValidationFail?.(stepId);
              return;
            }
            observer.disconnect();
            handleNext();
            return;
          }
        }
      }
    });

    observer.observe(target, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [isActive, currentStep, handleNext, stepValidators, onValidationFail]);

  // ツアーが非アクティブなら何も表示しない
  if (!isActive) return null;

  // カレンダー以外では非表示（ステートは維持、戻れば復帰）
  if (!isCalendarPage) return null;

  // 全ステップ完了（done カード表示）
  if (!currentStep) {
    return (
      <>
        <TourBackdrop />
        <TourDoneCard onDone={completeTour} />
      </>
    );
  }

  // beforeEnter 処理中は backdrop のみ表示
  if (isBeforeEnterPending) {
    return <TourBackdrop />;
  }

  const displayStep = currentStepIndex + 1;
  const isLastStep = currentStepIndex === activeSteps.length - 1;

  return (
    <>
      <TourBackdrop />
      <TourStep
        key={currentStep.id}
        targetSelector={currentStep.targetSelector}
        placement={currentStep.placement}
        titleKey={currentStep.titleKey}
        descriptionKey={currentStep.descriptionKey}
        currentStep={displayStep}
        totalSteps={activeSteps.length}
        isLastStep={isLastStep}
        onNext={handleNext}
        onSkip={skipTour}
        contentKey={currentStep.contentKey}
      />
    </>
  );
}
