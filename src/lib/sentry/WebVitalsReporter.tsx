'use client';

/**
 * Web Vitals レポーター
 *
 * Next.js公式のuseReportWebVitalsを使用してCore Web VitalsをSentryに送信
 *
 * 使用方法:
 * - app/layout.tsxに<WebVitalsReporter />を追加
 *
 * 参考:
 * - https://nextjs.org/docs/app/api-reference/functions/use-report-web-vitals
 * - https://web.dev/articles/vitals
 */

import * as Sentry from '@sentry/nextjs';
import { useReportWebVitals } from 'next/web-vitals';

/**
 * Google 2025公式閾値
 */
const THRESHOLDS = {
  FCP: { good: 1800, poor: 3000 },
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  INP: { good: 200, poor: 500 },
  TTFB: { good: 800, poor: 1800 },
  FID: { good: 100, poor: 300 }, // 廃止済みだが後方互換のため残す
} as const;

type MetricName = keyof typeof THRESHOLDS;

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const metricName = metric.name as MetricName;
    const threshold = THRESHOLDS[metricName];

    // Sentry v8: startSpanを使用
    Sentry.startSpan(
      {
        name: `Web Vital: ${metric.name}`,
        op: 'web.vital',
        attributes: {
          metric_name: metric.name,
          metric_rating: metric.rating,
          metric_id: metric.id,
          rating: metric.rating,
          id: metric.id,
        },
      },
      () => {
        // メトリクス値を記録
        Sentry.setMeasurement(
          metric.name,
          metric.value,
          metric.name === 'CLS' ? '' : 'millisecond',
        );

        // 閾値チェック
        if (threshold) {
          const isPoor = metric.value > threshold.poor;
          const needsImprovement = metric.value > threshold.good && metric.value <= threshold.poor;

          if (isPoor) {
            // Poorレベル: 警告送信
            Sentry.captureMessage(
              `Poor ${metric.name}: ${metric.value}${metric.name === 'CLS' ? '' : 'ms'}`,
              {
                level: 'warning',
                tags: {
                  metric_name: metric.name,
                  metric_value: metric.value,
                  threshold_good: threshold.good,
                  threshold_poor: threshold.poor,
                },
                extra: {
                  metric: {
                    name: metric.name,
                    value: metric.value,
                    rating: metric.rating,
                    id: metric.id,
                    navigationType: metric.navigationType,
                  },
                },
              },
            );
          } else if (needsImprovement) {
            // Needs Improvement: パンくずリストに記録
            Sentry.addBreadcrumb({
              message: `${metric.name} needs improvement`,
              category: 'web-vital',
              level: 'info',
              data: {
                value: metric.value,
                rating: metric.rating,
                threshold_good: threshold.good,
                threshold_poor: threshold.poor,
              },
            });
          }
        }

        // パンくずリストに記録
        Sentry.addBreadcrumb({
          message: `${metric.name} measured`,
          category: 'web-vital',
          level: 'info',
          data: {
            value: metric.value,
            rating: metric.rating,
            id: metric.id,
            navigationType: metric.navigationType,
          },
        });
      },
    );
  });

  // このコンポーネントはUIをレンダリングしない
  return null;
}
