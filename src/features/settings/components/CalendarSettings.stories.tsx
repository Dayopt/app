/**
 * CalendarSettings Stories
 *
 * tRPC の userSettings をモックしてカレンダー設定画面を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { CalendarSettings } from './calendar-settings';

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
};

// ─────────────────────────────────────────────────────────
// tRPC Mock Helpers
// ─────────────────────────────────────────────────────────

function createMockLink(responseMap: Record<string, unknown>): TRPCLink<AppRouter> {
  return () => {
    return ({ op }) =>
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
  };
}

function createPendingLink(): TRPCLink<AppRouter> {
  return () => {
    return () =>
      observable(() => {
        // observer.next / observer.complete を呼ばないことでローディングを維持
      });
  };
}

function MockProvider({
  children,
  responseMap,
  pending,
}: {
  children: ReactNode;
  responseMap?: Record<string, unknown>;
  pending?: boolean;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const link = pending ? createPendingLink() : createMockLink(responseMap ?? {});
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
  title: 'Features/Settings/CalendarSettings',
  component: CalendarSettings,
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
} satisfies Meta<typeof CalendarSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（週表示・週末あり・週番号なし） */
export const Default: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
  decorators: [
    (Story) => (
      <MockProvider responseMap={{ 'userSettings.get': MOCK_USER_SETTINGS }}>
        <Story />
      </MockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <MockProvider pending>
        <Story />
      </MockProvider>
    ),
  ],
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Default</h3>
        <MockProvider responseMap={{ 'userSettings.get': MOCK_USER_SETTINGS }}>
          <CalendarSettings />
        </MockProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Loading</h3>
        <MockProvider pending>
          <CalendarSettings />
        </MockProvider>
      </div>
    </div>
  ),
};
