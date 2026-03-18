import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { MonthlyTrendChart } from './MonthlyTrendChart';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

/**
 * 過去12ヶ月の月次記録時間。
 * 2025年4月〜2026年3月のトレンドデータ。
 */
const MOCK_MONTHLY_DATA = [
  { month: '2025-04', label: '4月', hours: 42.5 },
  { month: '2025-05', label: '5月', hours: 55.0 },
  { month: '2025-06', label: '6月', hours: 48.3 },
  { month: '2025-07', label: '7月', hours: 61.2 },
  { month: '2025-08', label: '8月', hours: 38.7 },
  { month: '2025-09', label: '9月', hours: 52.4 },
  { month: '2025-10', label: '10月', hours: 67.8 },
  { month: '2025-11', label: '11月', hours: 71.3 },
  { month: '2025-12', label: '12月', hours: 59.1 },
  { month: '2026-01', label: '1月', hours: 80.5 },
  { month: '2026-02', label: '2月', hours: 74.2 },
  { month: '2026-03', label: '3月', hours: 88.6 },
];

// ─────────────────────────────────────────────────────────
// tRPC モックヘルパー
// ─────────────────────────────────────────────────────────

type MonthlyItem = { month: string; label: string; hours: number };

function createMockLink(data: MonthlyItem[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'entries.getMonthlyTrend': data,
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        observer.complete();
      });
}

interface MockProviderProps {
  children: ReactNode;
  data: MonthlyItem[];
}

function MockProvider({ children, data }: MockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
    },
  });

  const trpcClient = api.createClient({ links: [createMockLink(data)] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/** MonthlyTrendChart — 月ごとの記録時間推移をエリアチャートで表示 */
const meta = {
  title: 'Features/Stats/Progress/MonthlyTrend',
  component: MonthlyTrendChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof MonthlyTrendChart>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト（ローディング状態） */
export const Default: Story = {};

/**
 * データあり状態
 *
 * 過去12ヶ月のエリアチャート。月平均・前月比トレンドがヘッダーに表示される。
 */
export const WithData: Story = {
  decorators: [
    (Story) => {
      useStatsFilterStore.setState({ granularity: 'year', currentDate: new Date('2026-03-10') });
      return (
        <MockProvider data={MOCK_MONTHLY_DATA}>
          <Story />
        </MockProvider>
      );
    },
  ],
};

/**
 * データなし状態
 *
 * 記録がない期間を選択した場合に表示される「No data」メッセージ。
 */
export const Empty: Story = {
  decorators: [
    (Story) => {
      useStatsFilterStore.setState({ granularity: 'year', currentDate: new Date('2026-03-10') });
      return (
        <MockProvider data={[]}>
          <Story />
        </MockProvider>
      );
    },
  ],
};
