import { beforeEach, describe, expect, it } from 'vitest';

import { useTagCacheStore } from './useTagCacheStore';

describe('useTagCacheStore', () => {
  beforeEach(() => {
    useTagCacheStore.setState({
      isSettling: false,
    });
  });

  describe('初期状態', () => {
    it('isSettlingがfalse', () => {
      expect(useTagCacheStore.getState().isSettling).toBe(false);
    });
  });

  describe('isSettling', () => {
    it('trueに設定できる', () => {
      useTagCacheStore.getState().setIsSettling(true);
      expect(useTagCacheStore.getState().isSettling).toBe(true);
    });

    it('falseに戻せる', () => {
      useTagCacheStore.getState().setIsSettling(true);
      useTagCacheStore.getState().setIsSettling(false);
      expect(useTagCacheStore.getState().isSettling).toBe(false);
    });
  });
});
