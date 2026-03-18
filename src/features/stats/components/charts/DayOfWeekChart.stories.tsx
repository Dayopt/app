import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { useStatsFilterStore } from '../../stores/useStatsFilterStore';
import { DayOfWeekChart } from './DayOfWeekChart';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

/** 月〜土の順で現実的な曜日別アクティビティ時間 */
const MOCK_DOW_DATA = [
  { day: '月', hours: 6.5 },
  { day: '火', hours: 7.2 },
  { day: '水', hours: 5.8 },
  { day: '木', hours: 8.1 },
  { day: '金', hours: 6.0 },
  { day: '土', hours: 3.2 },
  { day: '日', hours: 2.5 },
];

// ─────────────────────────────────────────────────────────
// tRPC モックヘルパー
// ─────────────────────────────────────────────────────────

type DowItem = { day: string; hours: number };

function createMockLink(data: DowItem[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'entries.getDayOfWeekDistribution': data,
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        observer.complete();
      });
}

interface MockProviderProps {
  children: ReactNode;
  data: DowItem[];
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

/** DayOfWeekChart — 曜日ごとのアクティビティ分布を棒グラフで表示 */
const meta = {
  title: 'Features/Stats/Progress/DayOfWeekChart',
  component: DayOfWeekChart,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DayOfWeekChart>;

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
 * 平日中心の活動パターン。木曜日が最も活動量が多い。
 * Weekdays/Weekends の合計時間も下部に表示される。
 */
export const WithData: Story = {
  decorators: [
    (Story) => {
      useStatsFilterStore.setState({ granularity: 'week', currentDate: new Date('2026-03-10') });
      return (
        <MockProvider data={MOCK_DOW_DATA}>
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
