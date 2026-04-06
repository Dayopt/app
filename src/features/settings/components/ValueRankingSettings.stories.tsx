/**
 * ValueRankingSettings Stories
 *
 * tRPC の userSettings.get をモックして価値観キーワードランキングを再現する。
 * dnd-kit によるドラッグ&ドロップはクライアントサイドで動作する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent, waitFor, within } from 'storybook/test';

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
    rankedValues: ['growth', 'creativity', 'autonomy', 'connection', 'health'],
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

/** デフォルト状態（ランキング設定済み、idle表示） */
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

/** 空状態（価値観キーワード未選択） — 「選択する」ボタンが表示される */
export const Empty: Story = {
  parameters: {
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_EMPTY },
  },
};

/**
 * 編集状態（キーワード選択 + 並べ替えUI表示）
 *
 * rankedValuesに既存の選択済みキーワードを設定した状態でレンダリングする。
 * 実際の編集モードへの遷移はユーザーが「編集」ボタンをクリックする必要があるが、
 * Defaultストーリーの「編集」ボタンから操作可能。
 */
export const Editing: Story = {
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.get': MOCK_USER_SETTINGS_WITH_RANKING },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const editButton = await waitFor(() =>
      canvas.getByRole('button', { name: /選択する|編集|edit/i }),
    );
    await userEvent.click(editButton);
  },
};
