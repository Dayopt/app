/**
 * 現在時刻を管理するフック
 */

import { useEffect, useState } from 'react';

interface UseCurrentTimeOptions {
  updateInterval?: number; // 更新間隔（ミリ秒）
  enabled?: boolean; // 更新を有効にするか
}

/** 一定間隔で現在時刻を更新するフック */
export function useCurrentTime(options: UseCurrentTimeOptions = {}) {
  const { updateInterval = 60000, enabled = true } = options; // デフォルト1分間隔

  // 遅延初期化で初期値を設定（useEffect内でのsetStateを回避）
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    if (!enabled) return;

    // 定期更新
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, updateInterval);

    return () => clearInterval(interval);
  }, [updateInterval, enabled]);

  return currentTime;
}
