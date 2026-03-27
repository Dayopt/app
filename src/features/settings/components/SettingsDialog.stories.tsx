/**
 * SettingsDialog Stories
 *
 * PC用設定ダイアログ。useShellStore で開閉・カテゴリを管理。
 * SettingsContent は各カテゴリコンポーネントを遅延読み込みするため、
 * tRPC モックで userSettings / notificationPreferences をカバー。
 *
 * 注意: SettingsContent は Suspense + lazy loading を使用する。
 * ローディング中はスケルトンが表示される。
 */

import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { ReactNode } from 'react';

import type { AppRouter } from '@/platform/trpc';
import { api } from '@/platform/trpc';

import { Button } from '@/components/ui/button';
import { useShellStore } from '@/shell/stores/useShellStore';
import type { SettingsCategory } from '../types';
import { SettingsDialog } from './SettingsDialog';

// ─────────────────────────────────────────────────────────
// モックデータ
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

const MOCK_NOTIFICATION_PREFERENCES = {
  emailEnabled: true,
  pushEnabled: false,
  reminderMinutes: 15,
};

const MOCK_PROFILE = {
  id: 'user-1',
  email: 'user@example.com',
  fullName: 'テストユーザー',
  avatarUrl: null,
};

// ─────────────────────────────────────────────────────────
// tRPC モックプロバイダー
// ─────────────────────────────────────────────────────────

function createMockLink(): TRPCLink<AppRouter> {
  return () =>
    ({ op }) =>
      observable((observer) => {
        if (op.type === 'query') {
          const responseMap: Record<string, unknown> = {
            'userSettings.get': MOCK_USER_SETTINGS,
            'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES,
            'profile.get': MOCK_PROFILE,
            'tags.list': { data: [] },
            'entries.getTagStats': { counts: {} },
          };
          const result = op.path in responseMap ? responseMap[op.path] : undefined;
          observer.next({ result: { type: 'data', data: result } });
        }
        if (op.type === 'mutation') {
          observer.next({ result: { type: 'data', data: {} } });
        }
        observer.complete();
      });
}

function MockProvider({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  const trpcClient = api.createClient({ links: [createMockLink()] });

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// インタラクティブラッパー
// ─────────────────────────────────────────────────────────

function InteractiveSettingsDialog({
  initialCategory = 'profile',
}: {
  initialCategory?: SettingsCategory;
}) {
  const [mounted, setMounted] = useState(false);

  return (
    <MockProvider>
      <Button
        onClick={() => {
          useShellStore.getState().openSettings(initialCategory);
          setMounted(true);
        }}
      >
        設定を開く
      </Button>
      {mounted && <SettingsDialog />}
    </MockProvider>
  );
}

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

/**
 * SettingsDialog — 設定ダイアログ（PC用）
 *
 * useShellStore で開閉とカテゴリ切替を管理。
 * URL は変更せず、モーダル内でサイドバーのカテゴリ切替のみ行う。
 */
const meta = {
  title: 'Features/Settings/SettingsDialog',
  component: SettingsDialog,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/**
 * デフォルト状態（プロフィールカテゴリ）
 *
 * ダイアログが開いた状態でプロフィール設定を表示。
 * サイドバーで他カテゴリに切り替えできる。
 */
export const Default: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'profile' } });
    return (
      <MockProvider>
        <SettingsDialog />
      </MockProvider>
    );
  },
};

/**
 * 表示設定カテゴリ
 */
export const DisplayCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'display' } });
    return (
      <MockProvider>
        <SettingsDialog />
      </MockProvider>
    );
  },
};

/**
 * 通知設定カテゴリ
 */
export const NotificationsCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'notifications' } });
    return (
      <MockProvider>
        <SettingsDialog />
      </MockProvider>
    );
  },
};

/**
 * データ設定カテゴリ
 */
export const DataCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'data' } });
    return (
      <MockProvider>
        <SettingsDialog />
      </MockProvider>
    );
  },
};

/**
 * アカウント設定カテゴリ
 */
export const AccountCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'account' } });
    return (
      <MockProvider>
        <SettingsDialog />
      </MockProvider>
    );
  },
};

/**
 * 閉じた状態
 *
 * activeSheet が null の場合、ダイアログは表示されない。
 */
export const ClosedState: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: null });
    return (
      <MockProvider>
        <SettingsDialog />
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">（ダイアログは閉じています）</p>
        </div>
      </MockProvider>
    );
  },
};

/**
 * ボタンクリックで開くインタラクティブモード
 *
 * 実際のユーザー操作フローを確認できる。
 */
export const Interactive: Story = {
  render: () => <InteractiveSettingsDialog />,
};
