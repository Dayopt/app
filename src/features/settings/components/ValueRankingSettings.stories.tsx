/**
 * ValueRankingSettings Stories
 *
 * tRPC の userSettings.get をモックして価値観キーワードランキングを再現する。
 * カテゴリタブ + 常時表示ランキングの統合ビュー。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';

import { ValueRankingSettings } from './value-ranking-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS_EMPTY = {
  ...PRESET_USER_SETTINGS.default,
  personalization: {
    values: {},
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

const MOCK_USER_SETTINGS_WITH_RANKING = {
  ...PRESET_USER_SETTINGS.default,
  personalization: {
    values: {},
    rankedValues: ['integrity', 'courage', 'honesty', 'compassion', 'connection'],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/ValueRankingSettings',
  component: ValueRankingSettings,
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
} satisfies Meta<typeof ValueRankingSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（ランキング設定済み、統合ビュー表示） */
export const Default: Story = {
  parameters: {
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_WITH_RANKING },
  },
};

/** データ取得中（ローディング状態） */
export const Loading: Story = {
  parameters: {
    trpcPending: true,
  },
};

/** 空状態（価値観キーワード未選択） — ヒントテキストが表示される */
export const Empty: Story = {
  parameters: {
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_EMPTY },
  },
};
