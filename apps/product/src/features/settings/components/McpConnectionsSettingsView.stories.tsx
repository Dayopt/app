import type { ReactNode } from 'react';
import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';

import { ConfirmDialog } from '@/components/ui/overlays/confirm-dialog';

import {
  McpConnectionRowView,
  type McpConnectionRowViewProps,
  McpConnectionsSettingsView,
} from './McpConnectionsSettingsView';

const CLAUDE_ROW: McpConnectionRowViewProps = {
  clientLabel: 'Claude',
  scopes: ['予定と実績を読む', 'タグを読む'],
  connectedAtLabel: '2026年8月1日 9:00',
  lastUsedAtLabel: '2026年8月9日 15:24',
  revoking: false,
  onRevoke: fn(),
};

const CHATGPT_ROW: McpConnectionRowViewProps = {
  clientLabel: 'ChatGPT',
  scopes: ['予定と実績を読む'],
  connectedAtLabel: '2026年7月20日 14:15',
  lastUsedAtLabel: '未使用',
  revoking: false,
  onRevoke: fn(),
};

const CURSOR_ROW: McpConnectionRowViewProps = {
  clientLabel: 'Cursor',
  scopes: ['予定と実績を読む', '予定を作成・編集する', '実績を作成・編集する'],
  connectedAtLabel: '2026年6月2日 11:40',
  lastUsedAtLabel: '2026年8月8日 8:05',
  revoking: false,
  onRevoke: fn(),
};

const UNKNOWN_CLIENT_ROW: McpConnectionRowViewProps = {
  clientLabel: '不明なクライアント',
  scopes: ['予定と実績を読む'],
  connectedAtLabel: '2026年5月14日 18:30',
  lastUsedAtLabel: '2026年5月15日 9:12',
  revoking: false,
  onRevoke: fn(),
};

function SettingsState({
  loading = false,
  error = false,
  rows = [],
  children,
}: {
  loading?: boolean;
  error?: boolean;
  rows?: McpConnectionRowViewProps[];
  /** rows とは別に並べたい要素（例: revoke 確認ダイアログ）。 */
  children?: ReactNode;
}) {
  return (
    <>
      <McpConnectionsSettingsView
        loading={loading}
        error={error}
        hasConnections={rows.length > 0}
        onRetry={fn()}
      >
        {rows.map((row) => (
          <McpConnectionRowView key={row.clientLabel} {...row} />
        ))}
      </McpConnectionsSettingsView>
      {children}
    </>
  );
}

function SingleConnectionState() {
  return <SettingsState rows={[CLAUDE_ROW]} />;
}

function MultipleConnectionsState() {
  return <SettingsState rows={[CLAUDE_ROW, CHATGPT_ROW, CURSOR_ROW, UNKNOWN_CLIENT_ROW]} />;
}

/** revoke ボタン押下で開く確認ダイアログ。不可逆操作のため destructive variant + 楽観的更新なし。 */
function RevokeConfirmationState() {
  const [open, setOpen] = useState(true);

  return (
    <SettingsState
      rows={[
        {
          ...CLAUDE_ROW,
          onRevoke: () => setOpen(true),
        },
      ]}
    >
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
        title="Claudeのアクセスを取り消しますか？"
        description="ClaudeはDayoptのデータにアクセスできなくなります。再度使うには、Claude側から接続し直してください。"
        confirmLabel="アクセスを取り消し"
        loadingLabel="取り消し中..."
        variant="destructive"
      />
    </SettingsState>
  );
}

const meta = {
  title: 'Product/Features/Settings/McpConnectionsSettings',
  component: McpConnectionsSettingsView,
  args: {
    loading: false,
    error: false,
    hasConnections: false,
    onRetry: fn(),
  },
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof McpConnectionsSettingsView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  render: () => <SettingsState loading />,
};

export const QueryError: Story = {
  render: () => <SettingsState error />,
};

export const Empty: Story = {
  render: () => <SettingsState />,
};

export const SingleConnection: Story = {
  render: () => <SingleConnectionState />,
};

export const MultipleConnections: Story = {
  render: () => <MultipleConnectionsState />,
};

export const RevokeConfirmation: Story = {
  render: () => <RevokeConfirmationState />,
  play: async () => {
    const body = within(document.body);
    await expect(await body.findByText('Claudeのアクセスを取り消しますか？')).toBeInTheDocument();
  },
};

export const AllPatterns: Story = {
  render: () => (
    <div className="space-y-8">
      <SettingsState loading />
      <SettingsState error />
      <SettingsState />
      <SingleConnectionState />
      <MultipleConnectionsState />
      <RevokeConfirmationState />
    </div>
  ),
};
