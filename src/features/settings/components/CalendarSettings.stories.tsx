/**
 * CalendarSettings Stories
 *
 * tRPC の userSettings をモックしてカレンダー設定画面を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';
import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';

import { CalendarSettings } from './calendar-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/CalendarSettings',
  component: CalendarSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: { 'userSettings.get': PRESET_USER_SETTINGS.default },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CalendarSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（週表示・週末あり・週番号なし） */
export const Default: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: { trpcPending: true },
};

/** 全ストーリーを並べて一覧表示 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">Default</h3>
        <StoryTRPCProvider mocks={{ 'userSettings.get': PRESET_USER_SETTINGS.default }}>
          <CalendarSettings />
        </StoryTRPCProvider>
      </div>
      <div>
        <h3 className="text-foreground mb-4 text-lg font-medium">Loading</h3>
        <StoryTRPCProvider pending>
          <CalendarSettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
