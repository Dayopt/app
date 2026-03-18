/**
 * ValueRankingSettings Stories
 *
 * tRPC の userSettings.get をモックして価値観キーワードランキングを再現する。
 * dnd-kit によるドラッグ&ドロップはクライアントサイドで動作する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';
import { userEvent, waitFor, within } from 'storybook/test';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { ValueRankingSettings } from './value-ranking-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS_EMPTY = {
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
    values: {},
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

const MOCK_USER_SETTINGS_WITH_RANKING = {
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
    values: {},
    rankedValues: ['growth', 'creativity', 'autonomy', 'connection', 'health'],
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

interface RankingMockProviderProps {
  children: ReactNode;
  pending?: boolean;
  settings?: typeof MOCK_USER_SETTINGS_WITH_RANKING;
}

function RankingMockProvider({ children, pending, settings }: RankingMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const resolvedSettings = settings ?? MOCK_USER_SETTINGS_WITH_RANKING;

  const link: TRPCLink<AppRouter> = pending
    ? createPendingLink()
    : createMockLink({ 'userSettings.get': resolvedSettings });

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
  title: 'Features/Settings/ValueRankingSettings',
  component: ValueRankingSettings,
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
} satisfies Meta<typeof ValueRankingSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（ランキング設定済み、idle表示） */
export const Default: Story = {
  decorators: [
    (Story) => (
      <RankingMockProvider>
        <Story />
      </RankingMockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <RankingMockProvider pending>
        <Story />
      </RankingMockProvider>
    ),
  ],
};

/** 空状態（価値観キーワード未選択） — 「選択する」ボタンが表示される */
export const Empty: Story = {
  decorators: [
    (Story) => (
      <RankingMockProvider settings={MOCK_USER_SETTINGS_EMPTY}>
        <Story />
      </RankingMockProvider>
    ),
  ],
};

/**
 * 編集状態（キーワード選択 + 並べ替えUI表示）
 *
 * rankedValuesに既存の選択済みキーワードを設定した状態でレンダリングする。
 * 実際の編集モードへの遷移はユーザーが「編集」ボタンをクリックする必要があるが、
 * Defaultストーリーの「編集」ボタンから操作可能。
 */
export const Editing: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  decorators: [
    (Story) => (
      <RankingMockProvider>
        <Story />
      </RankingMockProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editButton = await waitFor(() =>
      canvas.getByRole('button', { name: /選択する|編集|edit/i }),
    );
    await userEvent.click(editButton);
  },
};
