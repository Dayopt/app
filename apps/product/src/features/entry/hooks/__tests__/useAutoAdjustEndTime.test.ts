import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useAutoAdjustEndTime } from '../useAutoAdjustEndTime';

describe('useAutoAdjustEndTime', () => {
  describe('開始時刻のユーザー編集時の自動調整', () => {
    it('終了時刻が未設定の場合、開始時刻+1時間を設定する', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '', onEndTimeChange));

      act(() => {
        result.current.handleStartTimeChange('10:00');
      });

      expect(onEndTimeChange).toHaveBeenCalledWith('11:00');
    });

    it('終了時刻が設定済みの場合、時間幅を保持する', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:30', onEndTimeChange));

      // 開始時刻を1時間ずらす → 終了時刻も1時間ずれるべき（90分の幅を保持）
      act(() => {
        result.current.handleStartTimeChange('10:00');
      });

      expect(onEndTimeChange).toHaveBeenCalledWith('11:30');
    });

    it('23時以降の場合、日をまたいで計算する（24時間制ラップ）', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('22:00', '', onEndTimeChange));

      act(() => {
        result.current.handleStartTimeChange('23:30');
      });

      expect(onEndTimeChange).toHaveBeenCalledWith('00:30');
    });

    it('同じ開始時刻（同値編集・mobile picker の同値確定など）では呼ばない', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:00', onEndTimeChange));

      act(() => {
        result.current.handleStartTimeChange('09:00');
      });

      expect(onEndTimeChange).not.toHaveBeenCalled();
    });
  });

  describe('プログラム的な開始時刻変化では発火しない（回帰: 記録延長が再オープンで戻るバグ）', () => {
    it('handleStartTimeChange を経ない startTime 変化（初期ロード／エントリ切替／refetch）では onEndTimeChange を呼ばない', () => {
      const onEndTimeChange = vi.fn();

      const { rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '', endTime: '' } },
      );

      // entry ロードで startTime が '' → '13:00' に遷移（ユーザー編集ではない）
      rerender({ startTime: '13:00', endTime: '14:30' });
      // 別エントリへ切替で startTime が変化（ユーザー編集ではない）
      rerender({ startTime: '09:00', endTime: '10:00' });

      expect(onEndTimeChange).not.toHaveBeenCalled();
    });

    it('同値の開始時刻編集後にプログラム的な startTime 変化が来ても発火しない（flag-leak 回帰）', () => {
      const onEndTimeChange = vi.fn();

      const { result, rerender } = renderHook(
        ({ startTime, endTime }) => useAutoAdjustEndTime(startTime, endTime, onEndTimeChange),
        { initialProps: { startTime: '09:00', endTime: '10:00' } },
      );

      // mobile picker で同値を確定（onChange が同値で呼ばれる相当）→ 何も起きない
      act(() => {
        result.current.handleStartTimeChange('09:00');
      });
      // その後にエントリ切替などプログラム的な startTime 変化
      rerender({ startTime: '15:00', endTime: '16:00' });

      expect(onEndTimeChange).not.toHaveBeenCalled();
    });
  });

  describe('ハンドラーの戻り値', () => {
    it('handleStartTimeChangeは入力値をそのまま返す', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:00', onEndTimeChange));

      let returned: string;
      act(() => {
        returned = result.current.handleStartTimeChange('11:00');
      });
      expect(returned!).toBe('11:00');
    });

    it('handleEndTimeChangeは入力値をそのまま返し、onEndTimeChange を呼ばない', () => {
      const onEndTimeChange = vi.fn();
      const { result } = renderHook(() => useAutoAdjustEndTime('09:00', '10:00', onEndTimeChange));

      let returned: string;
      act(() => {
        returned = result.current.handleEndTimeChange('12:00');
      });
      expect(returned!).toBe('12:00');
      expect(onEndTimeChange).not.toHaveBeenCalled();
    });
  });
});
