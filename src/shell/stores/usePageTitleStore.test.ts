import { beforeEach, describe, expect, it } from 'vitest';

import { useShellStore } from './useShellStore';

describe('useShellStore - pageTitle', () => {
  beforeEach(() => {
    useShellStore.getState().clearPageTitle();
  });

  describe('初期状態', () => {
    it('タイトルが空文字', () => {
      expect(useShellStore.getState().pageTitle).toBe('');
    });
  });

  describe('setPageTitle', () => {
    it('タイトルを設定できる', () => {
      useShellStore.getState().setPageTitle('Calendar');
      expect(useShellStore.getState().pageTitle).toBe('Calendar');
    });

    it('上書きできる', () => {
      useShellStore.getState().setPageTitle('Calendar');
      useShellStore.getState().setPageTitle('Records');
      expect(useShellStore.getState().pageTitle).toBe('Records');
    });
  });

  describe('clearPageTitle', () => {
    it('タイトルをクリアできる', () => {
      useShellStore.getState().setPageTitle('Settings');
      useShellStore.getState().clearPageTitle();
      expect(useShellStore.getState().pageTitle).toBe('');
    });
  });
});
