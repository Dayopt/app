/**
 * AIStyleSettings Stories
 *
 * tRPC の userSettings.get をモックしてAIコミュニケーションスタイル設定を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { PRESET_USER_SETTINGS } from '../../../../.storybook/mocks/presets';

import { AIStyleSettings } from './ai-style-settings';

// ─────────────────────────────────────────────────────────
// Mock Data
// ─────────────────────────────────────────────────────────

const MOCK_USER_SETTINGS = {
  ...PRESET_USER_SETTINGS.default,
  personalization: {
    values: {},
    rankedValues: [],
    aiStyle: 'coach',
    aiCustomStylePrompt: '',
  },
};

/** カスタムスタイル選択時の設定値（テキストエリア表示確認用） */
const MOCK_USER_SETTINGS_CUSTOM = {
  ...MOCK_USER_SETTINGS,
  personalization: {
    ...MOCK_USER_SETTINGS.personalization,
    aiStyle: 'custom',
    aiCustomStylePrompt:
      '簡潔で率直なフィードバックをお願いします。専門用語を避け、具体的なアクションを提案してください。',
  },
};

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/AIStyleSettings',
  component: AIStyleSettings,
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
} satisfies Meta<typeof AIStyleSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** デフォルト状態（coachスタイル選択中） */
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

/**
 * カスタムスタイル選択状態
 *
 * aiStyle が「custom」の場合にテキストエリアが表示される。
 * 既存のカスタムプロンプトがあらかじめ入力されている。
 */
export const CustomStyle: Story = {
  parameters: {
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_CUSTOM },
  },
};
