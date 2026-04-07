/**
 * IntegrationSettings Stories
 *
 * tRPC の userSettings.getICalToken をモックして iCal フィード状態を再現する。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';

import { PRESET_AUTH } from '../../../../.storybook/mocks/presets';
import { StoryTRPCProvider } from '../../../../.storybook/mocks/trpc';

import { IntegrationSettings } from './integration-settings';

// ─────────────────────────────────────────────────────────
// Meta
// ─────────────────────────────────────────────────────────

const meta = {
  title: 'Features/Settings/IntegrationSettings',
  component: IntegrationSettings,
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
} satisfies Meta<typeof IntegrationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// ─────────────────────────────────────────────────────────
// Stories
// ─────────────────────────────────────────────────────────

/** iCalトークンが発行済みの状態 */
export const Default: Story = {
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.getICalToken': { token: 'mock-ical-token-abc123' } },
  },
};

/** iCalトークンが未発行の状態 */
export const NoToken: Story = {
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.getICalToken': { token: null } },
  },
};

/**
 * AI APIキー保存済みの状態（Savedバッジ表示）
 *
 * play関数でAPIキーを入力して保存ボタンをクリックし、
 * Savedバッジが表示されることを確認する。
 */
export const AIApiKeySaved: Story = {
  name: 'AI API Key — Saved (badge visible)',
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.getICalToken': { token: null } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Anthropic APIキー入力欄を探す（placeholder = "sk-ant-..."）
    const anthropicInput = canvas.getByPlaceholderText('sk-ant-...');
    await userEvent.type(
      anthropicInput,
      'sk-ant-api03-testkey12345678901234567890123456789012345678',
    );

    // 保存ボタンをクリック（最初の保存ボタン = Anthropic行）
    const saveButtons = canvas.getAllByRole('button', { name: /save|保存/i });
    // 入力行の保存ボタン（最初に有効化されているもの）をクリック
    const enabledSaveButton = saveButtons.find((btn) => !btn.hasAttribute('disabled'));
    if (enabledSaveButton) {
      await userEvent.click(enabledSaveButton);
    }

    // Savedバッジが表示されるまで待機
    await waitFor(
      () => {
        expect(canvas.getAllByText(/saved|保存済み/i).length).toBeGreaterThan(0);
      },
      { timeout: 5000 },
    );
  },
};

/**
 * iCalフィード — 再生成確認ダイアログ表示
 *
 * トークンが既に存在する状態で「再生成」ボタンをクリックすると
 * 確認ダイアログが表示されることを確認する。
 */
export const ICalRegenerateDialog: Story = {
  name: 'iCal Feed — Regenerate Confirm Dialog',
  parameters: {
    trpcMocks: { 'userSettings.getICalToken': { token: 'mock-ical-token-abc123' } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // フィードURLが読み込まれるまで待機
    await waitFor(
      () => {
        expect(canvas.getByDisplayValue(/mock-ical-token-abc123/)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    // 再生成ボタンをクリック（RefreshCwアイコンのボタン）
    const regenerateButton = canvas.getByRole('button', { name: /regener|再生成/i });
    await userEvent.click(regenerateButton);

    // 確認ダイアログが表示されるまで待機
    await waitFor(
      () => {
        // AlertDialogはbody直下にポータルされる
        const dialog = document.querySelector('[role="alertdialog"]');
        expect(dialog).toBeInTheDocument();
      },
      { timeout: 2000 },
    );
  },
};

/**
 * 同期が無効（オフ）の状態
 *
 * play関数でSyncトグルをクリックしてオフにする。
 */
export const SyncDisabled: Story = {
  name: 'Sync — Disabled',
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.getICalToken': { token: null } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Syncトグルスイッチを探してクリック（初期値はtrue=オン）
    const syncSwitch = canvas.getByRole('switch');
    await userEvent.click(syncSwitch);

    // トグルがオフになっていることを確認
    await waitFor(() => {
      expect(syncSwitch).toHaveAttribute('aria-checked', 'false');
    });
  },
};

/**
 * 同期が有効（オン）の状態（デフォルト）
 *
 * 初期状態でSyncがオンになっていることを確認する。
 */
export const SyncEnabled: Story = {
  name: 'Sync — Enabled (default)',
  parameters: {
    a11y: { test: 'todo' },
    trpcMocks: { 'userSettings.getICalToken': { token: null } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const syncSwitch = canvas.getByRole('switch');
    await waitFor(() => {
      expect(syncSwitch).toHaveAttribute('aria-checked', 'true');
    });
  },
};

/** 全パターン一覧 */
export const AllPatterns: Story = {
  parameters: {
    a11y: { test: 'todo' },
  },
  render: () => (
    <div className="space-y-12">
      <div>
        <h3 className="text-muted-foreground mb-4 text-sm">トークンあり</h3>
        <StoryTRPCProvider
          mocks={{ 'userSettings.getICalToken': { token: 'mock-ical-token-abc123' } }}
        >
          <IntegrationSettings />
        </StoryTRPCProvider>
      </div>
    </div>
  ),
};
