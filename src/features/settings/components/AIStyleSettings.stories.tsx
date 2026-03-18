/**
 * AIStyleSettings Stories
 *
 * tRPC の userSettings.get をモックしてAIコミュニケーションスタイル設定を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { AIStyleSettings } from './ai-style-settings';

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
    values: {},
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

/** カスタムスタイル選択時の設定値（テキストエリア表示確認用） */
const MOCK_USER_SETTINGS_CUSTOM: typeof MOCK_USER_SETTINGS = {
  ...MOCK_USER_SETTINGS,
  personalization: {
    ...MOCK_USER_SETTINGS.personalization,
    aiStyle: 'custom',
    aiCustomStylePrompt:
      '簡潔で率直なフィードバックをお願いします。専門用語を避け、具体的なアクションを提案してください。',
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

interface AIStyleMockProviderProps {
  children: ReactNode;
  pending?: boolean;
  settings?: typeof MOCK_USER_SETTINGS;
}

function AIStyleMockProvider({ children, pending, settings }: AIStyleMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const resolvedSettings = settings ?? MOCK_USER_SETTINGS;

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
  title: 'Features/Settings/AIStyleSettings',
  component: AIStyleSettings,
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
} satisfies Meta<typeof AIStyleSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（coachスタイル選択中） */
export const Default: Story = {
  decorators: [
    (Story) => (
      <AIStyleMockProvider>
        <Story />
      </AIStyleMockProvider>
    ),
  ],
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  decorators: [
    (Story) => (
      <AIStyleMockProvider pending>
        <Story />
      </AIStyleMockProvider>
    ),
  ],
};

/**
 * カスタムスタイル選択状態
 *
 * aiStyle が「custom」の場合にテキストエリアが表示される。
 * 既存のカスタムプロンプトがあらかじめ入力されている。
 */
export const CustomStyle: Story = {
  decorators: [
    (Story) => (
      <AIStyleMockProvider settings={MOCK_USER_SETTINGS_CUSTOM}>
        <Story />
      </AIStyleMockProvider>
    ),
  ],
};
