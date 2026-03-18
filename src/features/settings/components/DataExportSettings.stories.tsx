/**
 * DataExportSettings Stories
 *
 * tRPC の user.exportData をモックしてデータエクスポート設定画面を再現する。
 * exportData は enabled: false で初期化されるため、基本的にはUI表示のみ。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { DataExportSettings } from './data-export-settings';

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

interface DataExportMockProviderProps {
  children: ReactNode;
}

function DataExportMockProvider({ children }: DataExportMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

  const link: TRPCLink<AppRouter> = createMockLink({
    'user.exportData': {
      userId: 'mock-user-id',
      exportedAt: new Date().toISOString(),
      plans: [],
      records: [],
      tags: [],
      settings: {},
    },
  });

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
  title: 'Features/Settings/DataExportSettings',
  component: DataExportSettings,
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
} satisfies Meta<typeof DataExportSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（エクスポート・インポート・バックアップセクション表示） */
export const Default: Story = {
  decorators: [
    (Story) => (
      <DataExportMockProvider>
        <Story />
      </DataExportMockProvider>
    ),
  ],
};
