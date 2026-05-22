/**
 * ProfileSettings Stories
 *
 * useAuthStore のモックでプロフィール設定パネルを再現する。
 * ChronotypeSettings は tRPC を使うため、モックプロバイダーも用意する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_AUTH, PRESET_USER_SETTINGS } from '@dayopt/storybook/mocks/presets';

import { ProfileSettings } from './profile-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/ProfileSettings',
  component: ProfileSettings,
  parameters: {
    layout: 'padded',
    storeMocks: { useAuthStore: PRESET_AUTH.authenticated },
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示 */
export const Default: Story = {
  parameters: {
    trpcMocks: {
      'userSettings.get': PRESET_USER_SETTINGS.default,
    },
  },
};
