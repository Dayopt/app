import { beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_CHRONOTYPE_SETTINGS } from '@/lib/chronotype-defaults';

import { useChronotypeSettingsStore } from '../useChronotypeSettingsStore';

describe('useChronotypeSettingsStore', () => {
  beforeEach(() => {
    useChronotypeSettingsStore.getState().resetSettings();
  });

  describe('初期状態', () => {
    it('chronotype は DEFAULT_CHRONOTYPE_SETTINGS', () => {
      const state = useChronotypeSettingsStore.getState();
      expect(state.chronotype).toEqual(DEFAULT_CHRONOTYPE_SETTINGS);
    });

    it('chronotypeGradient は light/dark とも null', () => {
      const state = useChronotypeSettingsStore.getState();
      expect(state.chronotypeGradient).toEqual({ light: null, dark: null });
    });
  });

  describe('updateSettings', () => {
    it('chronotype を更新できる', () => {
      useChronotypeSettingsStore.getState().updateSettings({
        chronotype: { type: 'lion' },
      });
      const state = useChronotypeSettingsStore.getState();
      expect(state.chronotype).toEqual({ type: 'lion' });
    });

    it('chronotype を null にできる', () => {
      useChronotypeSettingsStore.getState().updateSettings({ chronotype: null });
      expect(useChronotypeSettingsStore.getState().chronotype).toBeNull();
    });

    it('chronotypeGradient を更新できる', () => {
      const gradient = {
        light: 'linear-gradient(...)',
        dark: 'linear-gradient(...)',
      };
      useChronotypeSettingsStore.getState().updateSettings({
        chronotypeGradient: gradient,
      });
      expect(useChronotypeSettingsStore.getState().chronotypeGradient).toEqual(gradient);
    });

    it('部分更新で他フィールドは維持される', () => {
      useChronotypeSettingsStore.getState().updateSettings({
        chronotypeGradient: { light: 'g1', dark: null },
      });
      useChronotypeSettingsStore.getState().updateSettings({
        chronotype: { type: 'wolf' },
      });
      const state = useChronotypeSettingsStore.getState();
      expect(state.chronotype).toEqual({ type: 'wolf' });
      expect(state.chronotypeGradient).toEqual({ light: 'g1', dark: null });
    });
  });

  describe('resetSettings', () => {
    it('全フィールドが default に戻る', () => {
      useChronotypeSettingsStore.getState().updateSettings({
        chronotype: { type: 'dolphin' },
        chronotypeGradient: { light: 'g1', dark: 'g2' },
      });
      useChronotypeSettingsStore.getState().resetSettings();
      const state = useChronotypeSettingsStore.getState();
      expect(state.chronotype).toEqual(DEFAULT_CHRONOTYPE_SETTINGS);
      expect(state.chronotypeGradient).toEqual({ light: null, dark: null });
    });
  });
});
