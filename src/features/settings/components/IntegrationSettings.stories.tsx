/**
 * IntegrationSettings Stories
 *
 * tRPC の userSettings.getICalToken をモックして iCal フィード状態を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';
import { useAuthStore } from '@/stores/useAuthStore';

import { IntegrationSettings } from './integration-settings';

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

interface IntegrationMockProviderProps {
  children: ReactNode;
  responseMap: Record<string, unknown>;
}

function IntegrationMockProvider({ children, responseMap }: IntegrationMockProviderProps) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });

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
  title: 'Features/Settings/IntegrationSettings',
  component: IntegrationSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: { id: 'mock-user', email: 'test@example.com' } as never,
      });
      return (
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof IntegrationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** iCalトークンが発行済みの状態 */
export const Default: Story = {
  decorators: [
    (Story) => (
      <IntegrationMockProvider
        responseMap={{ 'userSettings.getICalToken': { token: 'mock-ical-token-abc123' } }}
      >
        <Story />
      </IntegrationMockProvider>
    ),
  ],
};

/** iCalトークンが未発行の状態 */
export const NoToken: Story = {
  decorators: [
    (Story) => (
      <IntegrationMockProvider responseMap={{ 'userSettings.getICalToken': { token: null } }}>
        <Story />
      </IntegrationMockProvider>
    ),
  ],
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  decorators: [
    (Story) => (
      <IntegrationMockProvider
        responseMap={{ 'userSettings.getICalToken': { token: 'mock-ical-token-abc123' } }}
      >
        <Story />
      </IntegrationMockProvider>
    ),
  ],
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-muted-foreground mb-4 text-sm font-medium">トークンあり</h3>
        <IntegrationSettings />
      </div>
    </div>
  ),
};
