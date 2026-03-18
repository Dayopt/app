/**
 * ValuesSettings Stories
 *
 * tRPC の userSettings.get をモックして価値評定スケール（ACT 12領域）を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { ValuesSettings } from './values-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS = {
  timezone: 'Asia/Tokyo',
  showUtcOffset: true,
  timeFormat: '24h' as const,
  dateFormat: 'yyyy/MM/dd',
  weekStartsOn: 1 as const,
  showWeekends: true,
  showWeekNumbers: false,
  defaultDuration: 60,
  snapInterval: 15 as const,
  defaultView: 'week',
  hourHeightDensity: 'default',
  planRecordMode: 'both',
  chronotype: {
    enabled: true,
    type: 'moderate_morning' as const,
    displayMode: 'background' as const,
    opacity: 0.15,
    customZones: null,
  },
  personalization: {
    values: {
      family: { text: '家族との時間を大切にし、絆を深める', importance: 9 },
      work: { text: '自分の能力を活かして社会に貢献する', importance: 7 },
      health: { text: '心身の健康を維持し、エネルギーを保つ', importance: 8 },
    },
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

// ─────────────────────────────────────────────────────────
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

function createMockLink(responseMap: Record<string, unknown>): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: {} } });
        }
        observer.complete();
      });
}

function createPendingLink(): TRPCLink<AppRouter> {
  return () => () => observable(() => {});
}

interface ValuesMockProviderProps {
  children: ReactNode;
  pending?: boolean;
}

function ValuesMockProvider({ children, pending }: ValuesMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const link: TRPCLink<AppRouter> = pending
    ? createPendingLink()
    : createMockLink({ 'userSettings.get': MOCK_USER_SETTINGS });

  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/ValuesSettings',
  component: ValuesSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ValuesSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（一部の領域が記入済み） */
export const Default: Story = {
  decorators: [
    (Story) => (
      <ValuesMockProvider>
        <Story />
      </ValuesMockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <ValuesMockProvider pending>
        <Story />
      </ValuesMockProvider>
    ),
  ],
};
