/**
 * Metric Definitions Master
 *
 * 全メトリクスの定義を1箇所に集約。
 * 新メトリクス追加時はここに1エントリ追加するだけ。
 *
 * ラベル/descriptionは i18n キーで管理:
 *   calendar.stats.metrics.{metricId}
 *   calendar.stats.metrics.{metricId}Desc
 */

import { ArrowLeftRight, Clock, Flame, Gauge, Ratio, Star, Target, Timer } from 'lucide-react';

import type { MetricDefinition, MetricId } from '../types/metrics.types';

/** 全メトリクスの定義マスター（format / 閾値 / アイコン / バリアント） */
export const METRIC_DEFINITIONS: Record<MetricId, MetricDefinition> = {
  totalTime: {
    id: 'totalTime',
    format: 'duration',
    trendPositive: 'up',
    icon: Clock,
    variant: 'hero',
  },
  avgFulfillment: {
    id: 'avgFulfillment',
    format: 'score',
    trendPositive: 'up',
    icon: Star,
  },
  entryRate: {
    id: 'entryRate',
    format: 'percentage',
    trendPositive: 'up',
    thresholds: { good: 0.7, warning: 0.4 },
    icon: Target,
  },
  streak: {
    id: 'streak',
    format: 'days',
    trendPositive: 'up',
    icon: Flame,
    variant: 'hero',
  },
  estimationAccuracy: {
    id: 'estimationAccuracy',
    format: 'minutes',
    trendPositive: 'down',
    thresholds: { good: 10, warning: 30 },
    icon: Timer,
  },
  deepUtilization: {
    id: 'deepUtilization',
    format: 'percentage',
    trendPositive: 'up',
    thresholds: { good: 0.6, warning: 0.3 },
    icon: Gauge,
  },
  contextSwitches: {
    id: 'contextSwitches',
    format: 'count',
    trendPositive: 'down',
    icon: ArrowLeftRight,
  },
  blankRate: {
    id: 'blankRate',
    format: 'percentage',
    trendPositive: 'neutral',
    icon: Ratio,
  },
};

/** メトリクスの表示順序（Row1: 基本指標, Row2: 分析指標） */
export const METRIC_ORDER: MetricId[] = [
  'totalTime',
  'avgFulfillment',
  'entryRate',
  'streak',
  'estimationAccuracy',
  'deepUtilization',
  'contextSwitches',
  'blankRate',
];
