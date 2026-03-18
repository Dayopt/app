import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { YearlyHeatmap } from './YearlyHeatmap';

// ─────────────────────────────────────────────────────────
// モックデータ生成ヘルパー
// ─────────────────────────────────────────────────────────

/** 決定論的な固定データでモックを生成（スナップショットテスト安定化） */
function buildMockData(): Array<{ date: string; hours: number }> {
  // 固定の代表的な活動日セット
  return [
    { date: '2026-01-05', hours: 6.0 },
    { date: '2026-01-06', hours: 4.5 },
    { date: '2026-01-07', hours: 7.2 },
    { date: '2026-01-08', hours: 5.1 },
    { date: '2026-01-09', hours: 3.8 },
    { date: '2026-01-12', hours: 6.5 },
    { date: '2026-01-13', hours: 8.0 },
    { date: '2026-01-14', hours: 4.0 },
    { date: '2026-01-15', hours: 5.5 },
    { date: '2026-01-16', hours: 2.5 },
    { date: '2026-02-02', hours: 7.0 },
    { date: '2026-02-03', hours: 6.2 },
    { date: '2026-02-04', hours: 1.5 },
    { date: '2026-02-09', hours: 5.0 },
    { date: '2026-02-10', hours: 4.8 },
    { date: '2026-02-17', hours: 8.5 },
    { date: '2026-02-18', hours: 3.2 },
    { date: '2026-02-24', hours: 6.8 },
    { date: '2026-03-02', hours: 7.5 },
    { date: '2026-03-03', hours: 5.0 },
    { date: '2026-03-04', hours: 2.0 },
    { date: '2026-03-09', hours: 6.0 },
    { date: '2026-03-10', hours: 7.8 },
    { date: '2026-03-11', hours: 4.3 },
    { date: '2026-03-12', hours: 5.9 },
    { date: '2026-03-13', hours: 6.1 },
    { date: '2026-03-16', hours: 7.2 },
    { date: '2026-03-17', hours: 8.0 },
    { date: '2026-03-18', hours: 5.5 },
  ];
}

const MOCK_DAILY_DATA = buildMockData();

// ─────────────────────────────────────────────────────────
// tRPC モックヘルパー
// ─────────────────────────────────────────────────────────

type DailyItem = { date: string; hours: number };

function createMockLink(data: DailyItem[]): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'entries.getDailyHours': data,
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        observer.complete();
      });
}

interface MockProviderProps {
  children: ReactNode;
  data: DailyItem[];
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

/** YearlyHeatmap — 年間のアクティビティをヒートマップで表示 */
const meta = {
  title: 'Features/Stats/Progress/CalendarHeatmap',
  component: YearlyHeatmap,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof YearlyHeatmap>;

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
 * 2026年の活動グリッド。色の濃さで活動量（時間数）を表す。
 * 凡例（Less/More）は右下に表示。前後の年へのナビゲーションも可能。
 */
export const WithData: Story = {
  decorators: [
    (Story) => (
      <MockProvider data={MOCK_DAILY_DATA}>
        <Story />
      </MockProvider>
    ),
  ],
};

/**
 * データなし状態
 *
 * 記録がない年を表示した場合。ヒートマップのセルはすべてグレー表示となる。
 * 合計時間は 0h と表示される。
 */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <MockProvider data={[]}>
        <Story />
      </MockProvider>
    ),
  ],
};
