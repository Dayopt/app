/**
 * ProfileSettings Stories
 *
 * useAuthStore のモックでプロフィール設定パネルを再現する。
 * ChronotypeSettings / ValuesSettings 等の子コンポーネントは
 * 各自が tRPC を使うため、tRPC モックプロバイダーも用意する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';
import { useAuthStore } from '@/stores/useAuthStore';

import { ProfileSettings } from './profile-settings';

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

interface ProfileMockProviderProps {
  children: ReactNode;
}

function ProfileMockProvider({ children }: ProfileMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const responseMap: Record<string, unknown> = {
    'userSettings.get': MOCK_USER_SETTINGS,
    'chronotype.get': MOCK_USER_SETTINGS.chronotype,
    'values.list': [],
    'valueRanking.get': { rankings: [] },
  };

  const trpcClient = api.createClient({ links: [createMockLink(responseMap)] });

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
  title: 'Features/Settings/ProfileSettings',
  component: ProfileSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: {
          id: 'mock-user',
          email: 'user@example.com',
          user_metadata: {
            full_name: 'Test User',
            avatar_url: '',
          },
        } as never,
      });
      return (
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof ProfileSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <ProfileMockProvider>
        <Story />
      </ProfileMockProvider>
    ),
  ],
};
