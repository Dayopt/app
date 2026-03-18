import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { HourlyDistributionChart } from './HourlyDistributionChart';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

/**
 * 2時間ごとのタイムスロット（00:00〜22:00）の活動時間。
 * 午前10〜12時・午後14〜16時がピーク帯。
 */
const MOCK_HOURLY_DATA = [
  { timeSlot: '00:00', hours: 0.1 },
  { timeSlot: '02:00', hours: 0.0 },
  { timeSlot: '04:00', hours: 0.0 },
  { timeSlot: '06:00', hours: 0.3 },
  { timeSlot: '08:00', hours: 1.8 },
  { timeSlot: '10:00', hours: 3.5 },
  { timeSlot: '12:00', hours: 1.2 },
  { timeSlot: '14:00', hours: 4.1 },
  { timeSlot: '16:00', hours: 3.0 },
  { timeSlot: '18:00', hours: 2.2 },
  { timeSlot: '20:00', hours: 1.5 },
  { timeSlot: '22:00', hours: 0.8 },
];

// ─────────────────────────────────────────────────────────
// tRPC モックヘルパー
// ─────────────────────────────────────────────────────────

type HourlyItem = { timeSlot: string; hours: number };

function createMockLink(data: HourlyItem[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'entries.getHourlyDistribution': data,
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        observer.complete();
      });
}

interface MockProviderProps {
  children: ReactNode;
  data: HourlyItem[];
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

/** HourlyDistributionChart — 時間帯ごとのアクティビティ分布を横棒グラフで表示 */
const meta = {
  title: 'Features/Stats/Progress/HourlyDistribution',
  component: HourlyDistributionChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof HourlyDistributionChart>;

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
 * 午後14〜16時がピークの活動分布。下部に合計時間が表示される。
 */
export const WithData: Story = {
  decorators: [
    (Story) => {
      useStatsFilterStore.setState({ granularity: 'week', currentDate: new Date('2026-03-10') });
      return (
        <MockProvider data={MOCK_HOURLY_DATA}>
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
      useStatsFilterStore.setState({ granularity: 'week', currentDate: new Date('2026-03-10') });
      return (
        <MockProvider data={[]}>
          <Story />
        </MockProvider>
      );
    },
  ],
};
