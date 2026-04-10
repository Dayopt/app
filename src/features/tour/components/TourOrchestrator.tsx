'use client';

import { useCallback, useEffect, useState } from 'react';

import { usePathname } from '@/lib/i18n/navigation';

import { TOUR_START_DELAY } from '../constants';
import { useAutoAdvance } from '../hooks/useAutoAdvance';
import { useBeforeEnter } from '../hooks/useBeforeEnter';
import { useTourSnapshot } from '../hooks/useTourSnapshot';
import { useTourStore } from '../stores/useTourStore';
import { TourBackdrop } from './TourBackdrop';
import { TourDoneCard } from './TourDoneCard';
import { TourPreChoice } from './TourPreChoice';
import { TourStepRenderer } from './TourStepRenderer';

import type { StepValidationResult, StepValidators, TourStepId } from '../types';

interface TourOrchestratorProps {
  /** 自動進行時のバリデーション関数（composition 層から注入） */
  stepValidators?: StepValidators | undefined;
  /** バリデーション失敗時のコールバック */
  onValidationFail?: ((result: StepValidationResult) => void) | undefined;
}

/**
 * ツアーオーケストレータ
 *
 * GlobalOverlays にマウントし、カレンダーページでのみツアーを表示。
 * フック合成のみ行い、ロジックは各フック・FSM に委譲する。
 */
export function TourOrchestrator({ stepValidators, onValidationFail }: TourOrchestratorProps) {
  const pathname = usePathname();
  const snapshot = useTourSnapshot();
  const send = useTourStore.use.send();

  const isCalendarPage = pathname.startsWith('/calendar');

  // プレチョイス画面の表示状態
  const [showPreChoice, setShowPreChoice] = useState(false);

  // persist hydration 完了を待ってからツアー表示判定
  // hydration 前の初期値（completed: false）で誤判定しないようにする
  const [hydrated, setHydrated] = useState(useTourStore.persist.hasHydrated());

  useEffect(() => {
    if (hydrated) return;
    return useTourStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  // カレンダーページで未完了の場合、プレチョイスを表示
  useEffect(() => {
    if (!hydrated) return;
    if (!isCalendarPage || snapshot.status !== 'idle') return;

    // completed フラグをチェック（persist された状態）
    const machine = useTourStore.getState().machine;
    if (machine.completed) return;

    const timer = setTimeout(() => {
      setShowPreChoice(true);
    }, TOUR_START_DELAY);

    return () => clearTimeout(timer);
  }, [hydrated, isCalendarPage, snapshot.status]);

  const handlePreChoiceStart = useCallback(() => {
    setShowPreChoice(false);
    send({ type: 'START' });
  }, [send]);

  const handlePreChoiceSkip = useCallback(() => {
    setShowPreChoice(false);
    send({ type: 'START' });
    // START してすぐ SKIP で completed 状態にする
    send({ type: 'SKIP' });
  }, [send]);

  // フック: beforeEnter 処理（スクロール等）
  const handleBeforeEnterComplete = useCallback(
    (stepId: TourStepId) => {
      send({ type: 'BEFORE_ENTER_COMPLETE', stepId });
    },
    [send],
  );

  useBeforeEnter(
    snapshot.currentStep?.beforeEnter,
    snapshot.currentStep?.id,
    snapshot.status === 'before-enter',
    handleBeforeEnterComplete,
  );

  // フック: DOM 監視による自動進行
  const handleAdvance = useCallback(() => {
    send({ type: 'NEXT' });
  }, [send]);

  const currentValidator = snapshot.currentStep
    ? stepValidators?.[snapshot.currentStep.id]
    : undefined;

  useAutoAdvance(
    snapshot.currentStep?.autoAdvance,
    snapshot.status === 'active',
    handleAdvance,
    currentValidator,
    onValidationFail,
  );

  // ---- レンダリング ----

  // プレチョイス画面
  if (showPreChoice) {
    return (
      <>
        <TourBackdrop />
        <TourPreChoice onStart={handlePreChoiceStart} onSkip={handlePreChoiceSkip} />
      </>
    );
  }

  if (snapshot.status === 'idle' || snapshot.status === 'completed') return null;
  if (!isCalendarPage) return null;
  if (snapshot.status === 'before-enter') return null;

  if (snapshot.status === 'done') {
    return (
      <>
        <TourBackdrop />
        <TourDoneCard onDone={() => send({ type: 'COMPLETE' })} />
      </>
    );
  }

  // status === 'active'
  const { currentStep } = snapshot;
  if (!currentStep) return null;

  const showBackdrop = currentStep.placement === 'center';

  return (
    <>
      {showBackdrop && <TourBackdrop />}
      <TourStepRenderer
        key={currentStep.id}
        step={currentStep}
        snapshot={snapshot}
        onNext={() => send({ type: 'NEXT' })}
        onPrev={snapshot.canGoBack ? () => send({ type: 'PREV' }) : undefined}
        onSkip={() => send({ type: 'SKIP' })}
      />
    </>
  );
}
