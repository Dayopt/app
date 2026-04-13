import { beforeEach, describe, expect, it } from 'vitest';

import { useCalendarSettingsStore } from '@/features/calendar';

describe('useCalendarSettingsStore', () => {
  beforeEach(() => {
    useCalendarSettingsStore.getState().resetSettings();
  });

  describe('初期状態', () => {
    it('デフォルト値が正しい', () => {
      const state = useCalendarSettingsStore.getState();
      expect(state.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(state.timeFormat).toBe('24h');
      expect(state.dateFormat).toBe('yyyy-MM-dd');
      expect(state.defaultView).toBe('week');
      expect(state.weekStartsOn).toBe(1);
      expect(state.defaultDuration).toBe(60);
      expect(state.snapInterval).toBe(15);
      expect(state.showWeekends).toBe(true);
      expect(state.planRecordMode).toBe('both');
    });

    it('クロノタイプはデフォルト無効', () => {
      const state = useCalendarSettingsStore.getState();
      expect(state.chronotype.enabled).toBe(false);
      expect(state.chronotype.type).toBe('bear');
    });

    it('睡眠スケジュールのデフォルト', () => {
      const state = useCalendarSettingsStore.getState();
      expect(state.sleepSchedule.enabled).toBe(true);
      expect(state.sleepSchedule.bedtime).toBe(23);
      expect(state.sleepSchedule.wakeTime).toBe(7);
    });
  });

  describe('updateSettings', () => {
    it('一部の設定を更新できる', () => {
      useCalendarSettingsStore.getState().updateSettings({
        timeFormat: '12h',
        dateFormat: 'MM/dd/yyyy',
      });
      const state = useCalendarSettingsStore.getState();
      expect(state.timeFormat).toBe('12h');
      expect(state.dateFormat).toBe('MM/dd/yyyy');
      // 他は維持
      expect(state.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it('クロノタイプを有効化できる', () => {
      useCalendarSettingsStore.getState().updateSettings({
        chronotype: {
          enabled: true,
          type: 'lion',
        },
      });
      const state = useCalendarSettingsStore.getState();
      expect(state.chronotype.enabled).toBe(true);
      expect(state.chronotype.type).toBe('lion');
    });

    it('snapIntervalを変更できる', () => {
      useCalendarSettingsStore.getState().updateSettings({ snapInterval: 5 });
      expect(useCalendarSettingsStore.getState().snapInterval).toBe(5);
    });
  });

  describe('resetSettings', () => {
    it('全設定をデフォルトに戻す', () => {
      useCalendarSettingsStore.getState().updateSettings({
        timeFormat: '12h',
        weekStartsOn: 0,
        showWeekends: false,
      });
      useCalendarSettingsStore.getState().resetSettings();
      const state = useCalendarSettingsStore.getState();
      expect(state.timeFormat).toBe('24h');
      expect(state.weekStartsOn).toBe(1);
      expect(state.showWeekends).toBe(true);
    });
  });
});
