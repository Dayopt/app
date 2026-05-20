import { useEffect, useRef, useState } from 'react';

/**
 * 開始時刻変更時に終了時刻を自動調整するカスタムフック
 *
 * 動作:
 * - 開始時刻変更時: 終了時刻が未設定なら+1時間、設定済みなら時間幅を保持
 * - 終了時刻を手動変更: 自動調整を停止
 * - 開始時刻を再変更: 自動調整を再開
 *
 * @param startTime - 開始時刻 (HH:MM形式)
 * @param endTime - 終了時刻 (HH:MM形式)
 * @param onEndTimeChange - 終了時刻変更コールバック
 * @returns handleStartTimeChange, handleEndTimeChange
 */
export function useAutoAdjustEndTime(
  startTime: string,
  endTime: string,
  onEndTimeChange: (time: string) => void,
) {
  const [isEndTimeManuallySet, setIsEndTimeManuallySet] = useState(false);
  // refで前回の開始時刻を追跡（再レンダー不要）
  const previousStartTimeRef = useRef(startTime);

  // 開始時刻が変更されたら、終了時刻を自動調整（時間幅保持）
  useEffect(() => {
    if (startTime && startTime !== previousStartTimeRef.current && !isEndTimeManuallySet) {
      try {
        const [startHour, startMin] = startTime.split(':').map(Number);

        if (endTime) {
          // 終了時刻が既に設定されている場合: 時間幅を保持
          const [prevStartHour, prevStartMin] = (previousStartTimeRef.current || startTime)
            .split(':')
            .map(Number);
          const [endHour, endMin] = endTime.split(':').map(Number);

          const prevStartMinutes = prevStartHour! * 60 + prevStartMin!;
          const endMinutes = endHour! * 60 + endMin!;
          const durationMinutes = endMinutes - prevStartMinutes;

          // 開始時刻 + 既存の時間幅
          const startMinutes = startHour! * 60 + startMin!;
          const newEndMinutes = startMinutes + durationMinutes;
          const newEndHour = Math.floor(newEndMinutes / 60) % 24;
          const newEndMin = newEndMinutes % 60;

          const calculatedEndTime = `${newEndHour.toString().padStart(2, '0')}:${newEndMin.toString().padStart(2, '0')}`;
          onEndTimeChange(calculatedEndTime);
        } else {
          // 終了時刻が未設定の場合: +1時間
          const newEndHour = (startHour! + 1) % 24;
          const calculatedEndTime = `${newEndHour.toString().padStart(2, '0')}:${startMin!.toString().padStart(2, '0')}`;
          onEndTimeChange(calculatedEndTime);
        }

        previousStartTimeRef.current = startTime;
      } catch {
        // パースエラーの場合は何もしない
      }
    }
  }, [startTime, endTime, isEndTimeManuallySet, onEndTimeChange]);

  // 開始時刻変更ハンドラー
  const handleStartTimeChange = (time: string) => {
    setIsEndTimeManuallySet(false); // 開始時刻を変更したら自動計算を再開
    return time;
  };

  // 終了時刻変更ハンドラー
  const handleEndTimeChange = (time: string) => {
    setIsEndTimeManuallySet(true); // 終了時刻を手動で変更したら自動計算を停止
    return time;
  };

  return {
    handleStartTimeChange,
    handleEndTimeChange,
  };
}
