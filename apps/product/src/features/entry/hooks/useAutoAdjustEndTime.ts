import { useCallback } from 'react';

/**
 * 開始時刻のユーザー編集時に終了時刻を自動調整するカスタムフック
 *
 * 動作:
 * - 開始時刻をユーザーが編集した時: 終了時刻が未設定なら+1時間、設定済みなら時間幅を保持
 * - 終了時刻の手動変更: 何もしない（恒等関数）
 *
 * 重要: 自動調整は **ユーザーが開始時刻を編集した時だけ**（`handleStartTimeChange`
 * 呼び出し時に同期的に）行う。旧実装は `startTime` を監視する useEffect だったが、
 * Inspector を開いた時の `startTime: '' → entry値`、エントリ切替、refetch などの
 * プログラム的な startTime 変化でも発火し、未来 planned エントリで planned 終了の
 * 保存が走る → server 側 normalizeUpdateInput が actual を planned に reset するため
 * 直前に延長した記録(actual)が消えるバグを生んでいた。
 * ハンドラ内で同期処理にすることで、プログラム的変化では一切発火しない
 * （effect / フラグ ref を持たないため「同値編集でフラグが残る」類の競合も発生しない）。
 *
 * @param startTime - 現在の開始時刻 (HH:MM形式)
 * @param endTime - 現在の終了時刻 (HH:MM形式)
 * @param onEndTimeChange - 終了時刻変更コールバック
 * @returns handleStartTimeChange, handleEndTimeChange
 */
export function useAutoAdjustEndTime(
  startTime: string,
  endTime: string,
  onEndTimeChange: (time: string) => void,
) {
  // 開始時刻変更ハンドラー（ユーザー入力時のみ呼ばれる）
  const handleStartTimeChange = useCallback(
    (time: string) => {
      // 値が変わらない編集（mobile picker の同値確定など）では何もしない
      if (!time || time === startTime) return time;

      try {
        const [startHour, startMin] = time.split(':').map(Number);

        if (endTime) {
          // 終了時刻が既に設定されている場合: 時間幅を保持
          const [prevStartHour, prevStartMin] = (startTime || time).split(':').map(Number);
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
      } catch {
        // パースエラーの場合は何もしない
      }

      return time;
    },
    [startTime, endTime, onEndTimeChange],
  );

  // 終了時刻変更ハンドラー（恒等。API 互換のため残す）
  const handleEndTimeChange = useCallback((time: string) => time, []);

  return {
    handleStartTimeChange,
    handleEndTimeChange,
  };
}
