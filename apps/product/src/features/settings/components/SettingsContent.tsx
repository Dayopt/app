'use client';

import { Suspense, lazy, useEffect } from 'react';

import { CACHE_5_MINUTES } from '@/lib/date';
import { api } from '@/lib/trpc';
import { Skeleton } from '@dayopt/components';

import type { SettingsCategory } from '../types';

const DataSettingsComponent = lazy(() =>
  import('./DataSettings').then((module) => ({ default: module.DataSettings })),
);

const categoryComponents: Record<
  Exclude<SettingsCategory, 'data'>,
  React.LazyExoticComponent<React.ComponentType<object>>
> = {
  profile: lazy(() => import('./ProfileSettings').then((m) => ({ default: m.ProfileSettings }))),
  display: lazy(() => import('./DisplaySettings').then((m) => ({ default: m.DisplaySettings }))),
  billing: lazy(() => import('./BillingSettings').then((m) => ({ default: m.BillingSettings }))),
  account: lazy(() => import('./AccountSettings').then((m) => ({ default: m.AccountSettings }))),
};

const VALID_CATEGORIES = new Set<string>(['profile', 'display', 'data', 'billing', 'account']);
const PUBLIC_MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_RESOURCE_URI?.trim() || null;

/**
 * 文字列が有効な設定カテゴリかチェックする型ガード
 * @param category - チェック対象の文字列
 */
export function isValidCategory(category: string): category is SettingsCategory {
  return VALID_CATEGORIES.has(category);
}

interface SettingsContentProps {
  category: SettingsCategory;
}

/**
 * 設定コンテンツエリア
 *
 * カテゴリに応じたコンポーネントを遅延読み込みで表示
 * ルーティングページとダイアログの両方で再利用
 */
export function SettingsContent({ category }: SettingsContentProps) {
  const utils = api.useUtils();

  // マウント時に設定データをプリフェッチ
  useEffect(() => {
    void utils.userSettings.get.prefetch(undefined, { staleTime: CACHE_5_MINUTES });
  }, [utils]);

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
      <Suspense fallback={<SettingsLoadingSkeleton />}>
        <SettingsCategoryContent category={category} />
      </Suspense>
    </div>
  );
}

function SettingsCategoryContent({ category }: SettingsContentProps) {
  if (category === 'data') {
    return <DataSettingsComponent mcpServerUrl={PUBLIC_MCP_SERVER_URL} />;
  }

  const CategoryComponent = categoryComponents[category];
  return <CategoryComponent />;
}

function SettingsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
