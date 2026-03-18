/**
 * AccountSettings Stories
 *
 * Supabase Auth に依存するため、useAuthStore のモックのみで描画する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { useAuthStore } from '@/stores/useAuthStore';

import { AccountSettings } from './account-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/AccountSettings',
  component: AccountSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => {
      useAuthStore.setState({
        user: { id: 'mock-user', email: 'user@example.com' } as never,
      });
      return (
        <div className="mx-auto max-w-2xl">
          <Story />
        </div>
      );
    },
  ],
} satisfies Meta<typeof AccountSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト表示 */
export const Default: Story = {};
