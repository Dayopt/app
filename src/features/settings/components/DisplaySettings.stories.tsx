/**
 * DisplaySettings Stories
 *
 * tRPC の userSettings.get をモックして表示設定パネルを再現する。
 * useTourStore / useSettingsStore も decorator でセットアップする。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import { useTourStore } from '@/features/tour';
import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';
import { ThemeProvider } from '@/shell/providers/theme-provider';
import { useShellStore } from '@/shell/stores/useShellStore';

import { DisplaySettings } from './display-settings';

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

interface DisplayMockProviderProps {
  children: ReactNode;
  responseMap?: Record<string, unknown>;
  pending?: boolean;
}

function DisplayMockProvider({ children, responseMap, pending }: DisplayMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const link = pending
    ? createPendingLink()
    : createMockLink(responseMap ?? { 'userSettings.get': MOCK_USER_SETTINGS });
  const trpcClient = api.createClient({ links: [link] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/DisplaySettings',
  component: DisplaySettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useTourStore.setState({
        machine: { completed: true },
        send: () => {},
      } as never);
      useShellStore.setState({ activeSheet: { type: 'settings', category: 'profile' } });
      return (
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof DisplaySettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示（設定データ読み込み済み） */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <DisplayMockProvider>
        <Story />
      </DisplayMockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <DisplayMockProvider pending>
        <Story />
      </DisplayMockProvider>
    ),
  ],
};

/** ツアーが未完了の状態（リプレイボタン非表示） */
export const TourNotCompleted: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => {
      useTourStore.setState({
        machine: { completed: false },
        send: () => {},
      } as never);
      return (
        <DisplayMockProvider>
          <Story />
        </DisplayMockProvider>
      );
    },
  ],
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <DisplayMockProvider>
        <Story />
      </DisplayMockProvider>
    ),
  ],
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-muted-foreground mb-4 text-sm font-medium">デフォルト</h3>
        <DisplaySettings />
      </div>
    </div>
  ),
};
