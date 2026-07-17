/**
 * DisplaySettings Stories
 *
 * tRPC の userSettings.get をモックして表示設定パネルを再現する。
 * useSettingsStore も decorator でセットアップする。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ThemeProvider } from '@/app/[locale]/(app)/_providers/theme-provider';
import { useShellStore } from '@/lib/stores/useShellStore';
import { PRESET_USER_SETTINGS } from '@dayopt/storybook/mocks/presets';
import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';

import { DisplaySettings } from './DisplaySettings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Product/Features/Settings/DisplaySettings',
  component: DisplaySettings,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useShellStore.setState({ activeSheet: { type: 'settings', category: 'profile' } });
      return (
        <ThemeProvider>
          <div className="mx-auto max-w-2xl">
            <Story />
          </div>
        </ThemeProvider>
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
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-muted-foreground mb-4 text-sm">デフォルト</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': PRESET_USER_SETTINGS.default }}>
          <DisplaySettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
