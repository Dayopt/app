/**
 * ValuesSettings Stories
 *
 * tRPC の userSettings.get をモックして価値評定スケール（ACT 12領域）を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';

import { ValuesSettings } from './values-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS = {
  ...PRESET_USER_SETTINGS.default,
  personalization: {
    values: {
      family: { text: '家族との時間を大切にし、絆を深める', importance: 9 },
      work: { text: '自分の能力を活かして社会に貢献する', importance: 7 },
      health: { text: '心身の健康を維持し、エネルギーを保つ', importance: 8 },
    },
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/ValuesSettings',
  component: ValuesSettings,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ValuesSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（一部の領域が記入済み） */
export const Default: Story = {
  parameters: {
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS },
  },
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: {
    trpcPending: true,
  },
};
