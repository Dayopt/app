import { beforeEach, describe, expect, it } from 'vitest';

import { useInlineCreateStore } from '../useInlineCreateStore';

const mockSelection = {
  date: new Date('2026-03-30'),
  startHour: 10,
  startMinute: 0,
  endHour: 11,
  endMinute: 30,
};

describe('useInlineCreateStore', () => {
  beforeEach(() => {
    useInlineCreateStore.getState().clearPendingSelection();
  });

  describe('初期状態', () => {
    it('pendingSelectionがnull', () => {
      expect(useInlineCreateStore.getState().pendingSelection).toBeNull();
    });
  });

  describe('setPendingSelection', () => {
    it('選択範囲を設定できる', () => {
      useInlineCreateStore.getState().setPendingSelection(mockSelection);
      const state = useInlineCreateStore.getState();
      expect(state.pendingSelection).toEqual(mockSelection);
    });

    it('planned gap 由来の選択元を保持できる', () => {
      useInlineCreateStore
        .getState()
        .setPendingSelection({ ...mockSelection, creationSource: 'planned-gap' });

      expect(useInlineCreateStore.getState().pendingSelection?.creationSource).toBe('planned-gap');
    });

    it('レーン起点を保持できる', () => {
      useInlineCreateStore.getState().setPendingSelection({ ...mockSelection, lane: 'log' });

      expect(useInlineCreateStore.getState().pendingSelection?.lane).toBe('log');
    });

    it('既存の選択を上書きできる', () => {
      useInlineCreateStore.getState().setPendingSelection(mockSelection);
      const newSelection = { ...mockSelection, startHour: 14, endHour: 15 };
      useInlineCreateStore.getState().setPendingSelection(newSelection);
      expect(useInlineCreateStore.getState().pendingSelection?.startHour).toBe(14);
    });
  });

  describe('clearPendingSelection', () => {
    it('選択をクリアできる', () => {
      useInlineCreateStore.getState().setPendingSelection(mockSelection);
      useInlineCreateStore.getState().clearPendingSelection();
      expect(useInlineCreateStore.getState().pendingSelection).toBeNull();
    });
  });
});
