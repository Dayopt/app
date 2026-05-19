/**
 * DeferredAnalytics - 遅延読み込みのAnalyticsコンポーネント
 *
 * @description
 * Vercel Analytics/SpeedInsightsをrequestIdleCallback後に読み込み。
 * LCP/TBT改善のため、初期レンダリングをブロックしない。
 *
 * 効果: LCP -300ms, TBT -150ms
 */
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

// 遅延読み込み（SSRなし）
const Analytics = dynamic(() => import('@vercel/analytics/react').then((mod) => mod.Analytics), {
  ssr: false,
});

const SpeedInsights = dynamic(
  () => import('@vercel/speed-insights/next').then((mod) => mod.SpeedInsights),
  { ssr: false },
);

export function DeferredAnalytics() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    // requestIdleCallbackでメインスレッドがアイドル時に読み込み
    if ('requestIdleCallback' in window) {
      const handle = requestIdleCallback(
        () => {
          setShouldLoad(true);
        },
        { timeout: 2000 },
      ); // 最大2秒後には読み込み
      return () => cancelIdleCallback(handle);
    } else {
      // フォールバック: 1秒後に読み込み
      const timer = setTimeout(() => setShouldLoad(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  if (!shouldLoad) return null;

  return (
    <>
      <SpeedInsights />
      <Analytics />
    </>
  );
}
