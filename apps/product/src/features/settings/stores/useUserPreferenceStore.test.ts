import { beforeEach, describe, expect, it } from 'vitest';

import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';

describe('useUserPreferenceStore', () => {
  beforeEach(() => {
    useUserPreferenceStore.getState().resetPreferences();
  });

  describe('初期状態', () => {
    it('デフォルト値が正しい', () => {
      const state = useUserPreferenceStore.getState();
      expect(state.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
      expect(state.timeFormat).toBe('24h');
      expect(state.dateFormat).toBe('yyyy-MM-dd');
      expect(state.weekStartsOn).toBe(1);
      expect(state.showWeekNumbers).toBe(false);
      expect(state.defaultDuration).toBe(60);
      expect(state.snapInterval).toBe(15);
    });
  });

  describe('updatePreferences', () => {
    it('一部の設定を更新できる', () => {
      useUserPreferenceStore.getState().updatePreferences({
        timeFormat: '12h',
        dateFormat: 'MM/dd/yyyy',
      });
      const state = useUserPreferenceStore.getState();
      expect(state.timeFormat).toBe('12h');
      expect(state.dateFormat).toBe('MM/dd/yyyy');
      // 他は維持
      expect(state.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    });

    it('snapInterval を変更できる', () => {
      useUserPreferenceStore.getState().updatePreferences({ snapInterval: 5 });
      expect(useUserPreferenceStore.getState().snapInterval).toBe(5);
    });

    it('showWeekNumbers を切り替えられる', () => {
      useUserPreferenceStore.getState().updatePreferences({ showWeekNumbers: true });
      expect(useUserPreferenceStore.getState().showWeekNumbers).toBe(true);
    });
  });

  describe('resetPreferences', () => {
    it('全設定をデフォルトに戻す', () => {
      useUserPreferenceStore.getState().updatePreferences({
        timeFormat: '12h',
        weekStartsOn: 0,
        showWeekNumbers: true,
      });
      useUserPreferenceStore.getState().resetPreferences();
      const state = useUserPreferenceStore.getState();
      expect(state.timeFormat).toBe('24h');
      expect(state.weekStartsOn).toBe(1);
      expect(state.showWeekNumbers).toBe(false);
    });
  });
});
