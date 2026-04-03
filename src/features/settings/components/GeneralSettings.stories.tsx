/**
 * GeneralSettings Stories
 *
 * tRPC の userSettings をモックして一般設定画面を再現する。
 * useTheme / useLocale / useRouter / usePathname は Next.js Storybook が自動モック。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { ThemeProvider } from '@/shell/providers/theme-provider';
import { PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';
import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';

import { GeneralSettings } from './general-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/GeneralSettings',
  component: GeneralSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ThemeProvider>
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof GeneralSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（24h・Asia/Tokyo・月曜始まり） */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Default</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': PRESET_USER_SETTINGS.default }}>
          <GeneralSettings />
        </StoryTRPCProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-bold">Loading</h3>
        <StoryTRPCProvider pending>
          <GeneralSettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
