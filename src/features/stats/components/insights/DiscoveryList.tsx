'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';

import type { Discovery, DiscoveryCategory } from '../../types/discovery.types';

interface DiscoveryListProps {
  discoveries: Discovery[];
  className?: string;
}

const CATEGORY_KEYS: Record<DiscoveryCategory, string> = {
  time_pattern: 'categoryTimePattern',
  planning_accuracy: 'categoryPlanningAccuracy',
  trend_comparison: 'categoryTrendComparison',
  tag_affinity: 'categoryTagAffinity',
  consistency: 'categoryConsistency',
};

/**
 * Discovery の messageParams 内の dow キー（sun, mon, ...）を
 * ローカライズ済みの曜日名に変換する
 */
function resolveParams(
  params: Record<string, string | number> | undefined,
  dowT: (key: string) => string,
): Record<string, string | number> | undefined {
  if (!params || !('day' in params)) return params;

  const dayKey = String(params.day);
  return { ...params, day: dowT(dayKey) };
}

/**
 * DiscoveryList — 「小さな発見」リスト
 *
 * 警告アイコンなし。淡々とした観察を静かに並べる。
 * 0件の場合は何も表示しない。
 */
export function DiscoveryList({ discoveries, className }: DiscoveryListProps) {
  const t = useTranslations('calendar.stats.discoveries');
  const dowT = useTranslations('calendar.stats.dow');

  const items = useMemo(
    () =>
      discoveries.map((discovery) => ({
        ...discovery,
        resolvedParams: resolveParams(discovery.messageParams, dowT),
      })),
    [discoveries, dowT],
  );

  if (items.length === 0) return null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {items.map((item, i) => (
        <div
          key={`${item.category}-${item.messageKey}-${i}`}
          className="bg-card border-border-subtle rounded-lg border px-4 py-4 shadow-sm"
        >
          <p className="text-muted-foreground text-xs">{t(CATEGORY_KEYS[item.category])}</p>
          <p className="text-foreground mt-1 text-sm">{t(item.messageKey, item.resolvedParams)}</p>
        </div>
      ))}
    </div>
  );
}
