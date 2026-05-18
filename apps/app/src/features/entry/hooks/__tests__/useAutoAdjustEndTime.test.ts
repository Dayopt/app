import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoAdjustEndTime } from '../useAutoAdjustEndTime';

describe('useAutoAdjustEndTime', () => {
  describe('開始時刻変更時の自動調整', () => {
    it('終了時刻が未設定の場合、開始時刻+1時間を設定する', () => {
      const onEndTimeChange = vi.fn();

      const { rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '' } },
      );

      // 開始時刻を変更
      rerender({ startTime: '10:00', endTime: '' });

      expect(onEndTimeChange).toHaveBeenCalledWith('11:00');
    });

    it('終了時刻が設定済みの場合、時間幅を保持する', () => {
      const onEndTimeChange = vi.fn();

      const { rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '10:30' } },
      );

      // 開始時刻を1時間ずらす → 終了時刻も1時間ずれるべき（90分の幅を保持）
      rerender({ startTime: '10:00', endTime: '10:30' });

      expect(onEndTimeChange).toHaveBeenCalledWith('11:30');
    });

    it('23時以降の場合、日をまたいで計算する（24時間制ラップ）', () => {
      const onEndTimeChange = vi.fn();

      const { rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '22:00', endTime: '' } },
      );

      rerender({ startTime: '23:30', endTime: '' });

      expect(onEndTimeChange).toHaveBeenCalledWith('00:30');
    });
  });

  describe('手動変更による自動調整の停止', () => {
    it('終了時刻を手動変更すると自動調整が停止する', () => {
      const onEndTimeChange = vi.fn();

      const { result, rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '10:00' } },
      );

      // 手動で終了時刻を変更
      act(() => {
        result.current.handleEndTimeChange('12:00');
      });

      onEndTimeChange.mockClear();

      // 開始時刻を変更しても自動調整されない
      rerender({ startTime: '10:00', endTime: '12:00' });

      expect(onEndTimeChange).not.toHaveBeenCalled();
    });

    it('開始時刻を変更すると自動調整が再開する', () => {
      const onEndTimeChange = vi.fn();

      const { result, rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '10:00' } },
      );

      // 手動で終了時刻を変更（自動調整を停止）
      act(() => {
        result.current.handleEndTimeChange('12:00');
      });

      // handleStartTimeChangeを呼ぶと自動調整が再開
      act(() => {
        result.current.handleStartTimeChange('11:00');
      });

      onEndTimeChange.mockClear();

      // 開始時刻を変更すると自動調整される
      rerender({ startTime: '11:00', endTime: '12:00' });

      expect(onEndTimeChange).toHaveBeenCalled();
    });
  });

  describe('ハンドラーの戻り値', () => {
    it('handleStartTimeChangeは入力値をそのまま返す', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:00', onEndTimeChange));

      const returned = result.current.handleStartTimeChange('11:00');
      expect(returned).toBe('11:00');
    });

    it('handleEndTimeChangeは入力値をそのまま返す', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:00', onEndTimeChange));

      let returned: string;
      act(() => {
        returned = result.current.handleEndTimeChange('12:00');
      });
      expect(returned!).toBe('12:00');
    });
  });

  describe('エッジケース', () => {
    it('同じ開始時刻の場合は変更されない', () => {
      const onEndTimeChange = vi.fn();

      const { rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '10:00' } },
      );

      // 同じ値で再レンダリング
      rerender({ startTime: '09:00', endTime: '10:00' });

      expect(onEndTimeChange).not.toHaveBeenCalled();
    });
  });
});
