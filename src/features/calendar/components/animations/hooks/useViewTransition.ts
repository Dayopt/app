'use client';

import { useState } from 'react';

import type { CalendarView, SlideDirection } from '../types';

/** カレンダービュー切り替えのトランジション状態を管理するフック */
export function useViewTransition() {
  const [currentView, setCurrentView] = useState<CalendarView>('week');
  const [direction, setDirection] = useState<SlideDirection>('right');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const changeView = (newView: CalendarView, slideDirection: SlideDirection = 'right') => {
    if (newView === currentView || isTransitioning) return;

    setIsTransitioning(true);
    setDirection(slideDirection);
    setCurrentView(newView);
  };

  const handleTransitionComplete = () => {
    setIsTransitioning(false);
  };

  return {
    currentView,
    direction,
    isTransitioning,
    changeView,
    handleTransitionComplete,
  };
}
