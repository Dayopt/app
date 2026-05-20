/**
 * DataSettings Stories
 *
 * tRPC の user.exportData をモック（enabled: false で初期化されるため基本的にデータ不要）。
 * エクスポート・復元・MCP/API・データ削除の各セクションを表示。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { StoryTRPCProvider } from '@dayopt/storybook/mocks/trpc';

import { DataSettings } from './data-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/DataSettings',
  component: DataSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: {},
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DataSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（エクスポート・復元・MCP/API・データ削除の全セクション表示） */
export const Default: Story = {
  parameters: {
    a11y: { config: { rules: [{ id: 'button-name', enabled: false }] } },
  },
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
        <StoryTRPCProvider mocks={{}}>
          <DataSettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
