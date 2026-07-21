import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useReviewFilterStore } from '../useReviewFilterStore';

describe('useReviewFilterStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-10T12:00:00.000Z'));
    useReviewFilterStore.setState({
      granularity: 'week',
      currentDate: new Date(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('初期状態', () => {
    it('granularityがweek', () => {
      expect(useReviewFilterStore.getState().granularity).toBe('week');
    });
  });

  describe('setGranularity', () => {
    it('weekを保持する', () => {
      useReviewFilterStore.getState().setGranularity('week');
      expect(useReviewFilterStore.getState().granularity).toBe('week');
    });
  });

  describe('navigate', () => {
    it('week粒度で次の週に移動', () => {
      useReviewFilterStore.getState().setGranularity('week');
      useReviewFilterStore.getState().navigate('next');
      expect(useReviewFilterStore.getState().currentDate.getDate()).toBe(17);
    });

    it('todayで今日に戻る', () => {
      useReviewFilterStore.getState().setGranularity('week');
      useReviewFilterStore.getState().navigate('next');
      useReviewFilterStore.getState().navigate('next');
      useReviewFilterStore.getState().navigate('today');
      const date = useReviewFilterStore.getState().currentDate;
      expect(date.getDate()).toBe(10);
      expect(date.getMonth()).toBe(2); // March
    });
  });

  describe('状態の独立性', () => {
    it('navigateがgranularityに影響しない', () => {
      useReviewFilterStore.getState().navigate('next');
      expect(useReviewFilterStore.getState().granularity).toBe('week');
    });
  });
});
