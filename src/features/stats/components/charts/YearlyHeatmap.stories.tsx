import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { YearlyHeatmap } from './YearlyHeatmap';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

const MOCK_DAILY_DATA = [
  { day: '2026-01-05', hours: 6.0 },
  { day: '2026-01-06', hours: 4.5 },
  { day: '2026-01-07', hours: 7.2 },
  { day: '2026-01-08', hours: 5.1 },
  { day: '2026-01-09', hours: 3.8 },
  { day: '2026-01-12', hours: 6.5 },
  { day: '2026-01-13', hours: 8.0 },
  { day: '2026-02-02', hours: 7.0 },
  { day: '2026-02-03', hours: 6.2 },
  { day: '2026-02-04', hours: 1.5 },
  { day: '2026-02-17', hours: 8.5 },
  { day: '2026-03-02', hours: 7.5 },
  { day: '2026-03-03', hours: 5.0 },
  { day: '2026-03-10', hours: 7.8 },
  { day: '2026-03-17', hours: 8.0 },
];

// ─────────────────────────────────────────────────────────
// tRPC モック（YearlyHeatmap は内部 useQuery を使用）
// ─────────────────────────────────────────────────────────

type DailyItem = { day: string; hours: number };

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

function MockProvider({ children, data }: { children: ReactNode; data: DailyItem[] }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
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

/** YearlyHeatmap — 年間のアクティビティをCSS gridヒートマップで表示 */
const meta = {
  title: 'Features/Stats/Progress/CalendarHeatmap',
  component: YearlyHeatmap,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof YearlyHeatmap>;

export default meta;
type Story = StoryObj<typeof meta>;

/** データあり */
export const WithData: Story = {
  decorators: [
    (Story) => (
      <MockProvider data={MOCK_DAILY_DATA}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** データなし */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <MockProvider data={[]}>
        <Story />
      </MockProvider>
    ),
  ],
};
