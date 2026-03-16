'use client';

import { useCallback } from 'react';

import { usePathname } from '@/platform/i18n/navigation';

import { useAutoAdvance } from '../hooks/useAutoAdvance';
import { useBeforeEnter } from '../hooks/useBeforeEnter';
import { useTourAutoStart } from '../hooks/useTourAutoStart';
import { useTourSnapshot } from '../hooks/useTourSnapshot';
import { useTourStore } from '../stores/useTourStore';
import { TourBackdrop } from './TourBackdrop';
import { TourDoneCard } from './TourDoneCard';
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

  // フック: カレンダーページでの自動開始
  useTourAutoStart(isCalendarPage && snapshot.status !== 'completed');

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
