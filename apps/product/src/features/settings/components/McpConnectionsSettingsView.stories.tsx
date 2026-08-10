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
  disabled: false,
  onRevoke: fn(),
};

const CHATGPT_ROW: McpConnectionRowViewProps = {
  clientLabel: 'ChatGPT',
  scopes: ['予定と実績を読む'],
  connectedAtLabel: '2026年7月20日 14:15',
  lastUsedAtLabel: '未使用',
  revoking: false,
  disabled: false,
  onRevoke: fn(),
};

const CURSOR_ROW: McpConnectionRowViewProps = {
  clientLabel: 'Cursor',
  scopes: ['予定と実績を読む', '予定を作成・編集する', '実績を作成・編集する'],
  connectedAtLabel: '2026年6月2日 11:40',
  lastUsedAtLabel: '2026年8月8日 8:05',
  revoking: false,
  disabled: false,
  onRevoke: fn(),
};

const UNKNOWN_CLIENT_ROW: McpConnectionRowViewProps = {
  clientLabel: '不明なクライアント',
  scopes: ['予定と実績を読む'],
  connectedAtLabel: '2026年5月14日 18:30',
  lastUsedAtLabel: '2026年5月15日 9:12',
  revoking: false,
  disabled: false,
  onRevoke: fn(),
};

function SettingsState({
  loading = false,
  error = false,
  rows = [],
  hasNextPage = false,
  loadingMore = false,
  loadMoreError = false,
  children,
}: {
  loading?: boolean;
  error?: boolean;
  rows?: McpConnectionRowViewProps[];
  hasNextPage?: boolean;
  loadingMore?: boolean;
  loadMoreError?: boolean;
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
        hasNextPage={hasNextPage}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onLoadMore={fn()}
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

/** 「もっと見る」導線が出ている状態（#1909: keyset cursor の次ページあり）。 */
function HasMorePagesState() {
  return (
    <SettingsState rows={[CLAUDE_ROW, CHATGPT_ROW, CURSOR_ROW, UNKNOWN_CLIENT_ROW]} hasNextPage />
  );
}

/** 「もっと見る」を押して次ページ取得中の状態。 */
function LoadingMoreState() {
  return (
    <SettingsState
      rows={[CLAUDE_ROW, CHATGPT_ROW, CURSOR_ROW, UNKNOWN_CLIENT_ROW]}
      hasNextPage
      loadingMore
    />
  );
}

/** 追加読み込みが失敗した状態。既に読めている行は残したまま inline 文言で再試行を促す。 */
function LoadMoreFailedState() {
  return (
    <SettingsState
      rows={[CLAUDE_ROW, CHATGPT_ROW, CURSOR_ROW, UNKNOWN_CLIENT_ROW]}
      hasNextPage
      loadMoreError
    />
  );
}

/**
 * revoke 確認後、対象行（Claude）だけ「取り消し中」ラベルになり、他行は disabled になる。
 * mutation / dialog は全行で共有する 1 インスタンスのため、settle するまで他行から新しい
 * revoke を開始できないことを表す状態（#1909 フォローアップで見つかった再入バグの防止）。
 */
function RevokingBlocksOtherRowsState() {
  return (
    <SettingsState
      rows={[
        { ...CLAUDE_ROW, revoking: true, disabled: true },
        { ...CHATGPT_ROW, disabled: true },
        { ...CURSOR_ROW, disabled: true },
        { ...UNKNOWN_CLIENT_ROW, disabled: true },
      ]}
    />
  );
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

export const HasMorePages: Story = {
  render: () => <HasMorePagesState />,
};

export const LoadingMore: Story = {
  render: () => <LoadingMoreState />,
};

export const LoadMoreFailed: Story = {
  render: () => <LoadMoreFailedState />,
};

export const RevokingBlocksOtherRows: Story = {
  render: () => <RevokingBlocksOtherRowsState />,
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
      <RevokingBlocksOtherRowsState />
      <HasMorePagesState />
      <LoadingMoreState />
      <LoadMoreFailedState />
    </div>
  ),
};
