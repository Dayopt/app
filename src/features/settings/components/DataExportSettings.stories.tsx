/**
 * DataExportSettings Stories
 *
 * tRPC の user.exportData をモックしてデータエクスポート設定画面を再現する。
 * exportData は enabled: false で初期化されるため、基本的にはUI表示のみ。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { DataExportSettings } from './data-export-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_EXPORT_DATA = {
  userId: 'mock-user-id',
  exportedAt: new Date().toISOString(),
  plans: [],
  records: [],
  tags: [],
  settings: {},
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/DataExportSettings',
  component: DataExportSettings,
  parameters: {
    layout: 'padded',
    trpcMocks: {
      'user.exportData': MOCK_EXPORT_DATA,
    },
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
  parameters: {
    a11y: { test: 'todo' },
  },
};
