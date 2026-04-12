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

import { Button } from '@/components/ui/button';
import { useShellStore } from '@/lib/stores/useShellStore';
import { PRESET_AUTH, PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';
import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';
import type { SettingsCategory } from '../types';
import { SettingsDialog } from './SettingsDialog';

// ─────────────────────────────────────────────────────────
// モックデータ
// ─────────────────────────────────────────────────────────

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
// 共通 tRPC モックマップ
// ─────────────────────────────────────────────────────────

const DIALOG_MOCKS = {
  'userSettings.get': PRESET_USER_SETTINGS.default,
  'notificationPreferences.get': MOCK_NOTIFICATION_PREFERENCES,
  'profile.get': MOCK_PROFILE,
  'tags.list': { data: [] },
  'entries.getTagStats': { counts: {} },
};

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
    <StoryTRPCProvider mocks={DIALOG_MOCKS}>
      <Button
        onClick={() => {
          useShellStore.getState().openSettings(initialCategory);
          setMounted(true);
        }}
      >
        設定を開く
      </Button>
      {mounted && <SettingsDialog />}
    </StoryTRPCProvider>
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
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
    trpcMocks: DIALOG_MOCKS,
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
    return <SettingsDialog />;
  },
};

/**
 * 表示設定カテゴリ
 */
export const DisplayCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'display' } });
    return <SettingsDialog />;
  },
};

/**
 * 通知設定カテゴリ
 */
export const NotificationsCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'notifications' } });
    return <SettingsDialog />;
  },
};

/**
 * データ設定カテゴリ
 */
export const DataCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'data' } });
    return <SettingsDialog />;
  },
};

/**
 * アカウント設定カテゴリ
 */
export const AccountCategory: Story = {
  render: () => {
    useShellStore.setState({ activeSheet: { type: 'settings', category: 'account' } });
    return <SettingsDialog />;
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
      <>
        <SettingsDialog />
        <div className="flex h-screen items-center justify-center">
          <p className="text-muted-foreground text-sm">（ダイアログは閉じています）</p>
        </div>
      </>
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
