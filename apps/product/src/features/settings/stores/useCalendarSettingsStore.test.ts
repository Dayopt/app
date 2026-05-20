import { beforeEach, describe, expect, it } from 'vitest';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';

describe('useCalendarSettingsStore', () => {
  beforeEach(() => {
    useCalendarSettingsStore.getState().resetSettings();
  });

  describe('初期状態', () => {
    it('デフォルト値が正しい', () => {
      const state = useCalendarSettingsStore.getState();
      expect(state.defaultView).toBe('week');
      expect(state.showWeekends).toBe(true);
      expect(state.hourHeightDensity).toBe('default');
    });

    it('クロノタイプはデフォルト無効（null）', () => {
      const state = useCalendarSettingsStore.getState();
      expect(state.chronotype).toBeNull();
    });
  });

  describe('updateSettings', () => {
    it('一部の設定を更新できる', () => {
      useCalendarSettingsStore.getState().updateSettings({
        defaultView: 'day',
        hourHeightDensity: 'compact',
      });
      const state = useCalendarSettingsStore.getState();
      expect(state.defaultView).toBe('day');
      expect(state.hourHeightDensity).toBe('compact');
      // 他は維持
      expect(state.showWeekends).toBe(true);
    });

    it('クロノタイプを有効化できる', () => {
      useCalendarSettingsStore.getState().updateSettings({
        chronotype: { type: 'lion' },
      });
      const state = useCalendarSettingsStore.getState();
      expect(state.chronotype).toEqual({ type: 'lion' });
    });

    it('showWeekends を切り替えられる', () => {
      useCalendarSettingsStore.getState().updateSettings({ showWeekends: false });
      expect(useCalendarSettingsStore.getState().showWeekends).toBe(false);
    });
  });

  describe('resetSettings', () => {
    it('全設定をデフォルトに戻す', () => {
      useCalendarSettingsStore.getState().updateSettings({
        defaultView: 'day',
        showWeekends: false,
        hourHeightDensity: 'spacious',
      });
      useCalendarSettingsStore.getState().resetSettings();
      const state = useCalendarSettingsStore.getState();
      expect(state.defaultView).toBe('week');
      expect(state.showWeekends).toBe(true);
      expect(state.hourHeightDensity).toBe('default');
    });
  });
});
