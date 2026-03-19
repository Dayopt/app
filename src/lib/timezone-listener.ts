/**
 * タイムゾーン変更リスナー
 *
 * useCalendarSettingsStore が @/stores/ に移動したため、
 * @/features/settings/utils/timezone から必要な関数をここに切り出し。
 * 元のファイルはこのモジュールを re-export する。
 */

const TIMEZONE_CHANGE_EVENT = 'timezone-change';

/**
 * タイムゾーン変更イベントをリッスンし、変更時にコールバックを呼び出す
 * @param callback タイムゾーン変更時に呼ばれるコールバック（新しいタイムゾーン文字列を受け取る）
 * @returns クリーンアップ関数
 */
export const listenToTimezoneChange = (callback: (timezone: string) => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  const handleTimezoneChange = (event: CustomEvent) => {
    callback(event.detail.timezone);
  };

  window.addEventListener(TIMEZONE_CHANGE_EVENT, handleTimezoneChange as EventListener);

  // クリーンアップ関数を返す
  return () => {
    window.removeEventListener(TIMEZONE_CHANGE_EVENT, handleTimezoneChange as EventListener);
  };
};
